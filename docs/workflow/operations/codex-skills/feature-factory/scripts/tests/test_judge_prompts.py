import importlib.util
import json
import sys
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parents[1]

SPEC = importlib.util.spec_from_file_location("judge_prompts", SCRIPT_DIR / "judge_prompts.py")
assert SPEC and SPEC.loader
JUDGE_PROMPTS = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = JUDGE_PROMPTS
SPEC.loader.exec_module(JUDGE_PROMPTS)

try:
    import jsonschema
except Exception:  # pragma: no cover - fallback path is exercised when unavailable
    jsonschema = None


def _load_schema() -> dict:
    return json.loads((SCRIPT_DIR / "judge_schema.json").read_text(encoding="utf-8"))


def _validate_verdict(schema: dict, verdict: dict) -> None:
    if jsonschema is not None:
        jsonschema.validate(verdict, schema)
        return

    required = set(schema["required"])
    assert required.issubset(verdict), f"missing required fields: {sorted(required - set(verdict))}"
    assert verdict["judge"] in schema["properties"]["judge"]["enum"]
    assert verdict["verdict"] in schema["properties"]["verdict"]["enum"]
    confidence = verdict["confidence"]
    assert isinstance(confidence, int) and 0 <= confidence <= 5
    assert isinstance(verdict["reasoning"], str) and len(verdict["reasoning"]) >= 10
    evidence = verdict["evidence"]
    assert isinstance(evidence, list)
    for item in evidence:
        assert isinstance(item, dict)
        assert {"artifact", "section", "quote"}.issubset(item)
        assert isinstance(item["artifact"], str)
        assert isinstance(item["section"], str)
        assert isinstance(item["quote"], str)
    assert isinstance(verdict["timestamp"], str)


class JudgePromptTests(unittest.TestCase):
    def test_load_prompt_completeness(self) -> None:
        system_prompt, user_prompt = JUDGE_PROMPTS.load_prompt("completeness")
        self.assertIn("completeness auditor", system_prompt)
        self.assertIn("HIGH findings", user_prompt)

    def test_load_prompt_restatement(self) -> None:
        system_prompt, _ = JUDGE_PROMPTS.load_prompt("restatement")
        self.assertIn("review-loop auditor", system_prompt)

    def test_load_prompt_implementation_risk(self) -> None:
        system_prompt, _ = JUDGE_PROMPTS.load_prompt("implementation-risk")
        self.assertIn("implementation-risk assessor", system_prompt)

    def test_load_prompt_invalid_lens_raises(self) -> None:
        with self.assertRaises(ValueError):
            JUDGE_PROMPTS.load_prompt("nonsense")

    def test_substitute_happy_path(self) -> None:
        result = JUDGE_PROMPTS.substitute(
            "Hello {name}, welcome to {place}.",
            {"name": "Ada", "place": "ValueRank"},
        )
        self.assertEqual(result, "Hello Ada, welcome to ValueRank.")

    def test_substitute_missing_variable_raises_keyerror(self) -> None:
        with self.assertRaises(KeyError) as ctx:
            JUDGE_PROMPTS.substitute("Hello {name} {missing}.", {"name": "Ada"})
        self.assertIn("missing", str(ctx.exception))

    def test_validate_template_variables_all_prompts(self) -> None:
        for lens in JUDGE_PROMPTS.VALID_LENSES:
            _, template = JUDGE_PROMPTS.load_prompt(lens)
            JUDGE_PROMPTS.validate_template_variables(lens, template)

    def test_schema_validates_good_verdict(self) -> None:
        schema = _load_schema()
        verdict = {
            "judge": "completeness",
            "model": "gpt-5.4-mini",
            "verdict": "proceed",
            "confidence": 4,
            "reasoning": "The artifact explicitly names each mitigation.",
            "evidence": [
                {"artifact": "spec.md", "section": "Scope", "quote": "This closes the loop."}
            ],
            "timestamp": "2026-04-18T10:15:30Z",
        }
        _validate_verdict(schema, verdict)

    def test_schema_rejects_bad_verdict(self) -> None:
        schema = _load_schema()
        bad_confidence = {
            "judge": "restatement",
            "model": "gpt-5.4",
            "verdict": "block",
            "confidence": 7,
            "reasoning": "This is long enough to satisfy the minimum length.",
            "evidence": [
                {"artifact": "plan.md", "section": "Review", "quote": "The concern is new."}
            ],
            "timestamp": "2026-04-18T10:15:30Z",
        }
        missing_required = {
            "judge": "implementation-risk",
            "model": "claude-sonnet-4-6",
            "verdict": "proceed",
            "confidence": 3,
            "reasoning": "This is long enough to satisfy the minimum length.",
            "evidence": [
                {"artifact": "tasks.md", "section": "Implementation", "quote": "The path is clear."}
            ],
        }

        with self.assertRaises(Exception):
            _validate_verdict(schema, bad_confidence)
        with self.assertRaises(Exception):
            _validate_verdict(schema, missing_required)


if __name__ == "__main__":
    unittest.main()
