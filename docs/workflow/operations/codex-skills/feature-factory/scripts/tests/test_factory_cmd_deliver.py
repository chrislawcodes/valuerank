import argparse
import contextlib
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT_DIR = Path(__file__).resolve().parents[1]

STATE_SPEC = importlib.util.spec_from_file_location("factory_state", SCRIPT_DIR / "factory_state.py")
assert STATE_SPEC and STATE_SPEC.loader
FACTORY_STATE = importlib.util.module_from_spec(STATE_SPEC)
sys.modules[STATE_SPEC.name] = FACTORY_STATE
STATE_SPEC.loader.exec_module(FACTORY_STATE)

PR_BODY_SPEC = importlib.util.spec_from_file_location("factory_pr_body", SCRIPT_DIR / "factory_pr_body.py")
assert PR_BODY_SPEC and PR_BODY_SPEC.loader
FACTORY_PR_BODY = importlib.util.module_from_spec(PR_BODY_SPEC)
sys.modules[PR_BODY_SPEC.name] = FACTORY_PR_BODY
PR_BODY_SPEC.loader.exec_module(FACTORY_PR_BODY)

DELIVER_SPEC = importlib.util.spec_from_file_location("factory_cmd_deliver", SCRIPT_DIR / "factory_cmd_deliver.py")
assert DELIVER_SPEC and DELIVER_SPEC.loader
DELIVER = importlib.util.module_from_spec(DELIVER_SPEC)
sys.modules[DELIVER_SPEC.name] = DELIVER
DELIVER_SPEC.loader.exec_module(DELIVER)


SLUG = "ff-judge-panel"
_UNSET = object()


def _make_stage_state(
    *,
    unresolved_concerns: list[dict] | None = None,
    annotations: list[dict] | None = None,
    judge_rounds: int = 0,
    judge_verdicts: list[list[dict]] | None = None,
) -> dict:
    return {
        "adversarial_rounds": 3,
        "judge_rounds": judge_rounds,
        "judge_verdicts": judge_verdicts or [],
        "annotations": annotations or [],
        "unresolved_concerns": unresolved_concerns or [],
        "adversarial_sha_history": ["sha-round-1", "sha-round-2", "sha-round-3"],
        "initial_sha": "sha-round-1",
    }


def _make_state(stages: dict[str, dict]) -> dict:
    state = FACTORY_STATE._default_workflow_state()
    state["schema_version"] = 2
    state["stages"] = stages
    return state


def _make_pr_payload(
    *,
    state: str = "OPEN",
    body: str = "",
    number: int = 17,
    merge_commit: str = "",
    merged_at: str = "",
) -> dict:
    payload = {
        "number": number,
        "url": f"https://example.test/pr/{number}",
        "state": state,
        "isDraft": False,
        "headRefName": "feature/branch",
        "headRefOid": "head-sha",
        "baseRefName": "main",
        "mergeable": "MERGEABLE",
        "mergeStateStatus": "CLEAN",
        "body": body,
        "mergeCommit": {"oid": merge_commit} if merge_commit else None,
        "mergedAt": merged_at,
    }
    return payload


def _deliver_args(**overrides: object) -> argparse.Namespace:
    args = {
        "slug": SLUG,
        "create_pr": False,
        "draft": False,
        "base": None,
        "title": None,
        "override_judges": False,
        "reason": None,
        "refresh": False,
        "resume_merge_wait": False,
        "watch_ci": False,
        "interval": 10,
        "merge_when_green": False,
        "auto_merge": False,
        "dry_run": False,
    }
    args.update(overrides)
    return argparse.Namespace(**args)


class FactoryDeliverTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self._root_patch = patch.object(FACTORY_STATE, "FACTORY_RUNS_ROOT", Path(self._tmpdir.name))
        self._root_patch.start()
        self.addCleanup(self._root_patch.stop)

    def _write_state(self, state: dict) -> None:
        path = FACTORY_STATE.factory_state_path(SLUG)
        FACTORY_STATE.atomic_json_write(path, state)
        reviews_dir = FACTORY_STATE.reviews_dir(SLUG)
        reviews_dir.mkdir(parents=True, exist_ok=True)
        for stage in ("spec", "plan", "tasks", "diff"):
            manifest_path = FACTORY_STATE.checkpoint_manifest_path(SLUG, stage)
            if not manifest_path.exists():
                FACTORY_STATE.atomic_json_write(manifest_path, {"healthy": True})

    def _base_patches(self):
        # Import factory_deliver lazily so its globals can be patched here.
        import importlib
        factory_deliver = importlib.import_module("factory_deliver")
        return [
            patch.object(DELIVER, "ensure_sync", return_value=None),
            patch.object(DELIVER, "command_path", return_value=True),
            patch.object(DELIVER, "verify_checkpoint_manifest", return_value=(True, "")),
            patch.object(DELIVER, "reconciliation_state", return_value=(True, "")),
            patch.object(DELIVER, "current_branch_name", return_value="feature/branch"),
            patch.object(DELIVER, "upstream_branch_name", return_value="origin/main"),
            patch.object(DELIVER, "git_output", return_value="head-sha"),
            patch.object(DELIVER, "commits_behind_upstream", return_value=0),
            # PR #751: implementation-rule check makes its own git subprocess
            # calls. Mock to a no-op for existing deliver tests so they don't
            # trip on the new shell-out. Tests covering the rule live in
            # test_implementation_rule.py.
            patch.object(factory_deliver, "check_implementation_rule", return_value=("ok", "")),
        ]

    def _run_deliver(
        self,
        args: argparse.Namespace,
        *,
        current_pr_payload: object = _UNSET,
        required_check_summary: object = _UNSET,
        gh_side_effect=None,
    ) -> tuple[int, str, str]:
        with contextlib.ExitStack() as stack:
            for patcher in self._base_patches():
                stack.enter_context(patcher)
            if current_pr_payload is not _UNSET:
                if isinstance(current_pr_payload, list):
                    pr_values = iter(current_pr_payload)

                    def _next_pr(*_args, **_kwargs):
                        return next(pr_values)

                    stack.enter_context(patch.object(DELIVER, "current_pr_payload", side_effect=_next_pr))
                else:
                    stack.enter_context(patch.object(DELIVER, "current_pr_payload", return_value=current_pr_payload))
            if required_check_summary is not None:
                if callable(required_check_summary):
                    stack.enter_context(patch.object(DELIVER, "required_check_summary", side_effect=required_check_summary))
                else:
                    stack.enter_context(patch.object(DELIVER, "required_check_summary", return_value=required_check_summary))
            if gh_side_effect is not None:
                stack.enter_context(patch.object(DELIVER.subprocess, "run", side_effect=gh_side_effect))
            stdout = io.StringIO()
            stderr = io.StringIO()
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                rc = DELIVER.command_deliver(args)
        return rc, stdout.getvalue(), stderr.getvalue()

    def test_override_requires_reason(self) -> None:
        with patch.object(DELIVER, "ensure_sync", return_value=None), patch.object(DELIVER, "command_path", return_value=True):
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()) as stderr:
                with self.assertRaises(SystemExit) as ctx:
                    DELIVER.command_deliver(_deliver_args(override_judges=True))

        self.assertEqual(ctx.exception.code, 2)
        self.assertIn("requires --reason", stderr.getvalue())

    def test_override_records_state(self) -> None:
        self._write_state(
            _make_state(
                {
                    "plan": _make_stage_state(
                        unresolved_concerns=[
                            {
                                "stage": "plan",
                                "round": 2,
                                "judge": "completeness",
                                "confidence": 4,
                                "reasoning": "Missing rollback path.",
                                "also_raised_in_round": [1, 2],
                            }
                        ]
                    ),
                    "tasks": _make_stage_state(
                        unresolved_concerns=[
                            {
                                "stage": "tasks",
                                "round": 3,
                                "judge": "implementation-risk",
                                "confidence": 3,
                                "reasoning": "Merge wait may stall forever.",
                                "also_raised_in_round": [2, 3],
                            }
                        ]
                    ),
                }
            )
        )

        captured_bodies: list[str] = []

        def gh_side_effect(cmd, *args, **kwargs):
            if cmd[:3] == ["gh", "auth", "status"]:
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
            if cmd[:3] == ["gh", "pr", "edit"]:
                body_index = cmd.index("--body") + 1
                captured_bodies.append(cmd[body_index])
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
            raise AssertionError(f"unexpected command: {cmd}")

        with patch.dict(DELIVER.os.environ, {"USER": "test-operator"}, clear=False):
            rc, _, _ = self._run_deliver(
                _deliver_args(override_judges=True, reason="judge calibration", dry_run=True),
                current_pr_payload=_make_pr_payload(),
                required_check_summary=("pass", [], ""),
                gh_side_effect=gh_side_effect,
            )

        self.assertEqual(rc, 0)
        state = json.loads(FACTORY_STATE.factory_state_path(SLUG).read_text(encoding="utf-8"))
        override = state["override"]
        self.assertEqual(override["reason"], "judge calibration")
        self.assertEqual(override["operator_id"], "test-operator")
        # Concerns now carry backfilled id + lifecycle fields (FR-011a). Check the
        # stable subset rather than exact equality.
        affected = override["affected_concerns"]
        self.assertEqual(len(affected), 2)
        self.assertEqual(affected[0]["stage"], "plan")
        self.assertEqual(affected[0]["judge"], "completeness")
        self.assertEqual(affected[0]["reasoning"], "Missing rollback path.")
        self.assertTrue(affected[0].get("id"))
        self.assertEqual(affected[1]["stage"], "tasks")
        self.assertEqual(affected[1]["judge"], "implementation-risk")
        self.assertTrue(affected[1].get("id"))
        self.assertTrue(captured_bodies)
        self.assertIn(FACTORY_PR_BODY.SENTINEL_BEGIN, captured_bodies[0])
        self.assertIn("## ⚠ Shipped over judge objection", captured_bodies[0])

    def test_pr_body_sentinel_block_rendered(self) -> None:
        concern = {
            "stage": "plan",
            "round": 3,
            "judge": "completeness",
            "confidence": 4,
            "reasoning": "Missing rollback path in the plan.",
            "also_raised_in_round": [1, 2],
        }
        annotation = {
            "stage": "plan",
            "round": 3,
            "judge": "restatement",
            "confidence": 5,
            "reasoning": "Same concern, but note the rollout assumption.",
        }
        self._write_state(_make_state({"plan": _make_stage_state(unresolved_concerns=[concern], annotations=[annotation])}))

        captured_bodies: list[str] = []

        def gh_side_effect(cmd, *args, **kwargs):
            if cmd[:3] == ["gh", "auth", "status"]:
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
            if cmd[:3] == ["gh", "pr", "create"]:
                body_index = cmd.index("--body") + 1
                captured_bodies.append(cmd[body_index])
                return subprocess.CompletedProcess(cmd, 0, stdout="https://example.test/pr/17\n", stderr="")
            raise AssertionError(f"unexpected command: {cmd}")

        # Deliver now blocks on open concerns (P1-2 fix) unless --override-judges
        # is used. This test verifies the PR body sentinel rendering, not the
        # block-on-open-concerns gate (which has its own tests below).
        rc, _, _ = self._run_deliver(
            _deliver_args(create_pr=True, draft=True, dry_run=True, override_judges=True, reason="testing sentinel render"),
            current_pr_payload=None,
            gh_side_effect=gh_side_effect,
        )

        self.assertEqual(rc, 0)
        self.assertTrue(captured_bodies)
        body = captured_bodies[0]
        self.assertIn(FACTORY_PR_BODY.SENTINEL_BEGIN, body)
        self.assertIn(FACTORY_PR_BODY.SENTINEL_END, body)
        judge_block = body.split(FACTORY_PR_BODY.SENTINEL_BEGIN, 1)[1].split(FACTORY_PR_BODY.SENTINEL_END, 1)[0]
        self.assertIn("## ⚠ Unresolved Judge Concerns", judge_block)
        self.assertIn("Missing rollback path in the plan.", judge_block)
        self.assertIn("## Annotations", judge_block)
        self.assertIn("restatement", judge_block)

    def test_pr_body_sentinel_absent_no_concerns(self) -> None:
        self._write_state(_make_state({"plan": _make_stage_state()}))

        captured_bodies: list[str] = []

        def gh_side_effect(cmd, *args, **kwargs):
            if cmd[:3] == ["gh", "auth", "status"]:
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
            if cmd[:3] == ["gh", "pr", "create"]:
                body_index = cmd.index("--body") + 1
                captured_bodies.append(cmd[body_index])
                return subprocess.CompletedProcess(cmd, 0, stdout="https://example.test/pr/18\n", stderr="")
            raise AssertionError(f"unexpected command: {cmd}")

        rc, _, _ = self._run_deliver(
            _deliver_args(create_pr=True, draft=True, dry_run=True),
            current_pr_payload=None,
            gh_side_effect=gh_side_effect,
        )

        self.assertEqual(rc, 0)
        self.assertTrue(captured_bodies)
        body = captured_bodies[0]
        self.assertNotIn(FACTORY_PR_BODY.SENTINEL_BEGIN, body)
        self.assertNotIn(FACTORY_PR_BODY.SENTINEL_END, body)
        self.assertIn("## Workflow", body)

    def test_refresh_preserves_operator_edits(self) -> None:
        concern = {
            "stage": "plan",
            "round": 3,
            "judge": "implementation-risk",
            "confidence": 4,
            "reasoning": "Merge wait may stall forever unless the state machine is resumable.",
            "also_raised_in_round": [2, 3],
        }
        annotation = {
            "stage": "plan",
            "round": 3,
            "judge": "restatement",
            "confidence": 5,
            "reasoning": "This is the same merge-wait concern with a rollout note.",
        }
        state = _make_state({"plan": _make_stage_state(unresolved_concerns=[concern], annotations=[annotation])})
        self._write_state(state)

        old_block = "\n".join(
            [
                FACTORY_PR_BODY.SENTINEL_BEGIN,
                "## ⚠ Unresolved Judge Concerns",
                "### plan / completeness",
                "- stage: `plan`",
                "- judge: `completeness`",
                "- confidence: `4`",
                "- reasoning: Old concern that should be replaced.",
                "- also_raised_in_round: `1, 2`",
                "- round_raised: `2`",
                "",
                FACTORY_PR_BODY.SENTINEL_END,
            ]
        )
        existing_body = "\n".join(
            [
                "# Operator Notes",
                "This section should survive refresh.",
                "",
                old_block,
                "",
                "## Human Notes",
                "- keep this exactly as written",
            ]
        )
        # Reload state so expected reflects the backfilled concern fields (FR-011a).
        loaded_state = FACTORY_STATE.load_workflow_state(SLUG)
        expected_block = FACTORY_PR_BODY.render_judge_panel_block(loaded_state)
        expected_body, _ = FACTORY_PR_BODY.upsert_judge_panel_block(existing_body, expected_block)

        captured_bodies: list[str] = []

        def gh_side_effect(cmd, *args, **kwargs):
            if cmd[:3] == ["gh", "auth", "status"]:
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
            if cmd[:3] == ["gh", "pr", "view"]:
                return subprocess.CompletedProcess(cmd, 0, stdout=json.dumps({"body": existing_body}), stderr="")
            if cmd[:3] == ["gh", "pr", "edit"]:
                body_index = cmd.index("--body") + 1
                captured_bodies.append(cmd[body_index])
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
            raise AssertionError(f"unexpected command: {cmd}")

        rc, stdout, _ = self._run_deliver(
            _deliver_args(refresh=True),
            gh_side_effect=gh_side_effect,
        )

        self.assertEqual(rc, 0)
        self.assertTrue(captured_bodies)
        self.assertEqual(captured_bodies[0], expected_body)
        self.assertIn("# Operator Notes", captured_bodies[0])
        self.assertIn("## Human Notes", captured_bodies[0])
        self.assertNotIn("Old concern that should be replaced.", captured_bodies[0])
        self.assertNotIn("warn: ff-judge-panel sentinels were missing", stdout)

    def test_refresh_warns_when_sentinels_missing(self) -> None:
        state = _make_state({"plan": _make_stage_state(unresolved_concerns=[{
            "stage": "plan",
            "round": 3,
            "judge": "completeness",
            "confidence": 4,
            "reasoning": "Missing rollback path.",
            "also_raised_in_round": [1, 2],
        }])})
        self._write_state(state)

        existing_body = "\n".join(
            [
                "# Operator Notes",
                "No judge block has ever been inserted here.",
            ]
        )
        loaded_state = FACTORY_STATE.load_workflow_state(SLUG)
        expected_block = FACTORY_PR_BODY.render_judge_panel_block(loaded_state)
        expected_body = f"{expected_block}\n\n{existing_body}"

        captured_bodies: list[str] = []

        def gh_side_effect(cmd, *args, **kwargs):
            if cmd[:3] == ["gh", "auth", "status"]:
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
            if cmd[:3] == ["gh", "pr", "view"]:
                return subprocess.CompletedProcess(cmd, 0, stdout=json.dumps({"body": existing_body}), stderr="")
            if cmd[:3] == ["gh", "pr", "edit"]:
                body_index = cmd.index("--body") + 1
                captured_bodies.append(cmd[body_index])
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
            raise AssertionError(f"unexpected command: {cmd}")

        rc, stdout, _ = self._run_deliver(
            _deliver_args(refresh=True),
            gh_side_effect=gh_side_effect,
        )

        self.assertEqual(rc, 0)
        self.assertTrue(captured_bodies)
        self.assertEqual(captured_bodies[0], expected_body)
        self.assertIn("warn: ff-judge-panel sentinels were missing from the PR body; prepending judge block", stdout)

    def test_merge_wait_transitions_to_merged(self) -> None:
        state = _make_state({"plan": _make_stage_state()})
        self._write_state(state)

        pr_sequence = [
            _make_pr_payload(body="# existing body"),
            _make_pr_payload(state="MERGED", body="# existing body", merge_commit="merge-sha", merged_at="2026-04-19T17:00:00Z"),
        ]

        def gh_side_effect(cmd, *args, **kwargs):
            if cmd[:3] == ["gh", "auth", "status"]:
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
            if cmd[:3] == ["gh", "pr", "edit"]:
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
            raise AssertionError(f"unexpected command: {cmd}")

        rc, _, _ = self._run_deliver(
            _deliver_args(),
            current_pr_payload=pr_sequence,
            required_check_summary=("pass", [], ""),
            gh_side_effect=gh_side_effect,
        )

        self.assertEqual(rc, 0)
        persisted = json.loads(FACTORY_STATE.factory_state_path(SLUG).read_text(encoding="utf-8"))
        delivery = persisted["delivery"]
        self.assertEqual(delivery["merge_wait_state"], "merged")
        self.assertEqual(delivery["merged_sha"], "merge-sha")
        self.assertEqual(delivery["merged_at_iso8601"], "2026-04-19T17:00:00Z")

    def test_resume_merge_wait_from_waiting(self) -> None:
        state = _make_state({"plan": _make_stage_state()})
        state["delivery"] = {
            "pr_number": 17,
            "merge_wait_state": "waiting",
            "branch": "feature/branch",
            "head_sha": "head-sha",
            "upstream": "origin/main",
            "pr_url": "https://example.test/pr/17",
            "checks_summary": "pass",
        }
        self._write_state(state)

        def gh_side_effect(cmd, *args, **kwargs):
            if cmd[:3] == ["gh", "auth", "status"]:
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
            raise AssertionError(f"unexpected command: {cmd}")

        rc, _, _ = self._run_deliver(
            _deliver_args(resume_merge_wait=True),
            current_pr_payload=_make_pr_payload(
                state="MERGED",
                body="# existing body",
                merge_commit="merge-sha",
                merged_at="2026-04-19T17:00:00Z",
            ),
            gh_side_effect=gh_side_effect,
        )

        self.assertEqual(rc, 0)
        persisted = json.loads(FACTORY_STATE.factory_state_path(SLUG).read_text(encoding="utf-8"))
        self.assertEqual(persisted["delivery"]["merge_wait_state"], "merged")
        self.assertEqual(persisted["delivery"]["merged_sha"], "merge-sha")
        self.assertEqual(persisted["delivery"]["merged_at_iso8601"], "2026-04-19T17:00:00Z")

    def test_resume_merge_wait_nothing_to_resume(self) -> None:
        state = _make_state({"plan": _make_stage_state()})
        state["delivery"] = {
            "pr_number": 17,
            "merge_wait_state": "none",
        }
        self._write_state(state)

        def gh_side_effect(cmd, *args, **kwargs):
            if cmd[:3] == ["gh", "auth", "status"]:
                return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
            raise AssertionError(f"unexpected command: {cmd}")

        rc, stdout, _ = self._run_deliver(
            _deliver_args(resume_merge_wait=True),
            gh_side_effect=gh_side_effect,
        )

        self.assertEqual(rc, 0)
        self.assertIn("nothing to resume", stdout)


if __name__ == "__main__":
    unittest.main()
