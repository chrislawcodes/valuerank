#!/usr/bin/env python3
"""command_discover implementation."""
import argparse
import sys
import time
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from factory_state import (  # noqa: E402
    DISCOVERY_KEY,
    blocking_unresolved_items,
    discovery_blockers_are_malformed,
    default_discovery_state,
    update_discovery_state,
)

from factory_git import ensure_sync  # noqa: E402

from factory_review import trim_detail  # noqa: E402

from factory_emit import _emit_next_action  # noqa: E402
from factory_mutating import mutates_state  # noqa: E402


@mutates_state("discover")
def command_discover(args: argparse.Namespace) -> int:
    ensure_sync()
    clear = getattr(args, "clear", False)
    force_complete = getattr(args, "force_complete", False)
    if clear and any(
        [
            args.required,
            args.count is not None,
            args.question,
            args.recommendation,
            args.rationale,
            args.assumption,
            args.summary is not None,
            args.complete,
            force_complete,
            getattr(args, "unresolved", None) is not None,
            getattr(args, "resolve", None) is not None,
            getattr(args, "defer", None) is not None,
            getattr(args, "non_goal", None) is not None,
            getattr(args, "acceptance_criteria", None) is not None,
            getattr(args, "answer", None) is not None,
        ]
    ):
        raise SystemExit("discover --clear cannot be combined with other discovery updates")
    if args.count is not None and args.count < 0:
        raise SystemExit("discover requires --count to be zero or greater")
    if any([args.question, args.recommendation, args.rationale]) and not all(
        [args.question, args.recommendation, args.rationale]
    ):
        raise SystemExit("discover requires --question, --recommendation, and --rationale together")
    if not clear and not any(
        [
            args.required,
            args.count is not None,
            args.question,
            args.assumption,
            args.summary is not None,
            args.complete,
            force_complete,
            getattr(args, "unresolved", None) is not None,
            getattr(args, "resolve", None) is not None,
            getattr(args, "defer", None) is not None,
            getattr(args, "non_goal", None) is not None,
            getattr(args, "acceptance_criteria", None) is not None,
            getattr(args, "answer", None) is not None,
        ]
    ):
        raise SystemExit("discover requires at least one update, or use --clear to reset discovery state")

    def mutate(discovery: dict) -> None:
        if clear:
            preserved_required = bool(discovery.get("required"))
            preserved_question_count = discovery.get("question_count", 0)
            if not isinstance(preserved_question_count, int):
                preserved_question_count = 0
            preserved_asked_count = discovery.get("asked_count", 0)
            if not isinstance(preserved_asked_count, int):
                preserved_asked_count = 0
            preserved_questions = discovery.get("questions", [])
            if not isinstance(preserved_questions, list):
                preserved_questions = []
            preserved_assumptions = discovery.get("assumptions", [])
            if not isinstance(preserved_assumptions, list):
                preserved_assumptions = []
            preserved_summary = discovery.get("summary", "")
            if not isinstance(preserved_summary, str):
                preserved_summary = ""
            preserved_answers = discovery.get("answers", {})
            if not isinstance(preserved_answers, dict):
                preserved_answers = {}
            preserved_non_goals = discovery.get("non_goals", [])
            if not isinstance(preserved_non_goals, list):
                preserved_non_goals = []
            preserved_acceptance = discovery.get("acceptance_criteria", [])
            if not isinstance(preserved_acceptance, list):
                preserved_acceptance = []
            discovery.clear()
            discovery.update(default_discovery_state())
            discovery["required"] = (
                preserved_required
                or bool(preserved_question_count)
                or bool(preserved_questions)
                or bool(preserved_assumptions)
            )
            discovery["question_count"] = preserved_question_count
            discovery["asked_count"] = preserved_asked_count
            discovery["questions"] = preserved_questions
            discovery["assumptions"] = preserved_assumptions
            discovery["summary"] = preserved_summary
            discovery["answers"] = preserved_answers
            discovery["non_goals"] = preserved_non_goals
            discovery["acceptance_criteria"] = preserved_acceptance
            discovery["unresolved"] = []
            discovery["complete"] = False
            discovery["updated_at"] = int(time.time())
            return
        if args.required:
            discovery["required"] = True
        if args.count is not None:
            if discovery.get("asked_count", 0) > args.count:
                raise SystemExit(
                    "discover requires --count to stay at or above the number of already asked questions; "
                    "use --clear to restart discovery"
                )
            discovery["question_count"] = args.count
            discovery["required"] = discovery["required"] or args.count > 0
        if args.question:
            questions = list(discovery.get("questions", []))
            questions.append(
                {
                    "question": args.question,
                    "recommendation": args.recommendation,
                    "rationale": args.rationale,
                    "updated_at": int(time.time()),
                }
            )
            discovery["questions"] = questions
            discovery["asked_count"] = len(questions)
            discovery["required"] = True
            if discovery.get("question_count", 0) < len(questions):
                discovery["question_count"] = len(questions)
        if args.assumption:
            assumptions = list(discovery.get("assumptions", []))
            for assumption in args.assumption:
                if assumption not in assumptions:
                    assumptions.append(assumption)
            discovery["assumptions"] = assumptions
            discovery["required"] = discovery["required"] or bool(assumptions)
        if args.summary is not None:
            discovery["summary"] = args.summary
            discovery["required"] = discovery["required"] or bool(args.summary.strip())
        if getattr(args, "answer", None) is not None:
            question_text, answer_text = args.answer
            if not isinstance(discovery.get("answers"), dict):
                discovery["answers"] = {}
            discovery["answers"][question_text] = answer_text
        if getattr(args, "unresolved", None) is not None:
            item_text = args.unresolved
            unresolved = discovery.setdefault("unresolved", [])
            if not any(u["item"] == item_text for u in unresolved):
                unresolved.append({"item": item_text, "deferred": False})
        if getattr(args, "resolve", None) is not None:
            resolve_text = args.resolve
            discovery["unresolved"] = [
                u for u in discovery.get("unresolved", []) if u["item"] != resolve_text
            ]
        if getattr(args, "defer", None) is not None:
            defer_text = args.defer
            for u in discovery.get("unresolved", []):
                if u["item"] == defer_text:
                    u["deferred"] = True
                    break
        if getattr(args, "non_goal", None) is not None:
            ng = discovery.setdefault("non_goals", [])
            if args.non_goal not in ng:
                ng.append(args.non_goal)
        if getattr(args, "acceptance_criteria", None) is not None:
            ac = discovery.setdefault("acceptance_criteria", [])
            if args.acceptance_criteria not in ac:
                ac.append(args.acceptance_criteria)
        blocking = blocking_unresolved_items(discovery)
        if args.complete:
            if blocking:
                if discovery_blockers_are_malformed(discovery):
                    raise SystemExit(
                        "discover cannot mark discovery complete while discovery state is malformed; "
                        "use discover --clear to reset malformed discovery state"
                    )
                raise SystemExit(
                    "discover cannot mark discovery complete while unresolved items remain; "
                    "resolve or defer each item first"
                )
            if not force_complete and int(discovery.get("asked_count", 0)) < int(discovery.get("question_count", 0)):
                raise SystemExit(
                    "discover cannot mark discovery complete before the planned questions are recorded; "
                    "use --force-complete if you intentionally want to override the count"
                )
            discovery["complete"] = True
        elif (
            args.required
            or args.count is not None
            or args.question
            or args.assumption
            or args.summary is not None
            or getattr(args, "answer", None) is not None
            or getattr(args, "unresolved", None) is not None
            or getattr(args, "resolve", None) is not None
            or getattr(args, "defer", None) is not None
            or getattr(args, "non_goal", None) is not None
            or getattr(args, "acceptance_criteria", None) is not None
        ):
            discovery["complete"] = False
        if force_complete:
            if blocking:
                raise SystemExit(
                    "discover cannot force discovery complete while unresolved items remain; "
                    "resolve or defer each item first"
                )
            discovery["complete"] = True
        discovery["updated_at"] = int(time.time())

    state = update_discovery_state(args.slug, mutate)
    discovery = state.get(DISCOVERY_KEY, {})
    remaining = max(int(discovery.get("question_count", 0)) - int(discovery.get("asked_count", 0)), 0)
    print(f"workflow: {args.slug}")
    print("discovery:")
    print(f"- version: {discovery.get('version', 1)}")
    print(f"- required: {'yes' if discovery.get('required') else 'no'}")
    print(f"- complete: {'yes' if discovery.get('complete') else 'no'}")
    print(f"- question-count: {discovery.get('question_count', 0)}")
    print(f"- asked-count: {discovery.get('asked_count', 0)}")
    print(f"- remaining: {remaining}")
    if discovery.get("assumptions"):
        print(f"- assumptions: {len(discovery.get('assumptions', []))}")
        for assumption in discovery.get("assumptions", []):
            print(f"- assumption: {assumption}")
    if discovery.get("summary"):
        print(f"- summary: {trim_detail(str(discovery.get('summary', '')))}")
    if discovery.get("non_goals"):
        print(f"- non-goals: {len(discovery['non_goals'])}")
        for ng in discovery["non_goals"]:
            print(f"  - {ng}")
    if discovery.get("acceptance_criteria"):
        print(f"- acceptance-criteria: {len(discovery['acceptance_criteria'])}")
        for ac in discovery["acceptance_criteria"]:
            print(f"  - {ac}")
    if discovery.get("answers"):
        print(f"- answers: {len(discovery['answers'])}")
    if discovery.get("unresolved"):
        print(f"- unresolved: {len(discovery['unresolved'])}")
        for u in discovery["unresolved"]:
            status = " [deferred]" if u.get("deferred") else ""
            print(f"  - {u['item']}{status}")
    if args.complete or getattr(args, "force_complete", False):
        _emit_next_action(args.slug, "discovery complete")
    return 0
