"""
Integration tests for Consistency report data emission in analyze_basic.py.

Split out from test_analyze_basic.py to keep that file under the 1200-line
test-file hard cap. Tests the new perScenario Bernoulli counts and perPair
Coherence ingredients that the Models / Consistency report reads.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

WORKERS_DIR = Path(__file__).parent.parent
if str(WORKERS_DIR) not in sys.path:
    sys.path.insert(0, str(WORKERS_DIR))


def run_analyze_basic(input_data: dict) -> dict:
    """Run analyze_basic.py with given input and return output."""
    workers_dir = Path(__file__).parent.parent
    result = subprocess.run(
        [sys.executable, "analyze_basic.py"],
        input=json.dumps(input_data),
        capture_output=True,
        text=True,
        cwd=workers_dir,
        env={**dict(__import__("os").environ), "PYTHONPATH": str(workers_dir)},
    )
    return json.loads(result.stdout)


class TestReliabilityConsistencyEmission:
    def test_reliability_summary_emits_bernoulli_counts_and_skips_single_trial_scenarios(self):
        """Repeatability should emit pair counts only for scenarios with at least two trials."""
        input_data = {
            "runId": "test-run-reliability-bernoulli",
            "transcripts": [
                {
                    "id": "t1",
                    "modelId": "m1",
                    "scenarioId": "s1",
                    "sampleIndex": 0,
                    "summary": {"score": 5, "values": {}},
                    "decisionModelV2": {"canonical": {"direction": "favor_first", "strength": "strong"}},
                    "scenario": {},
                },
                {
                    "id": "t2",
                    "modelId": "m1",
                    "scenarioId": "s1",
                    "sampleIndex": 1,
                    "summary": {"score": 5, "values": {}},
                    "decisionModelV2": {"canonical": {"direction": "favor_first", "strength": "strong"}},
                    "scenario": {},
                },
                {
                    "id": "t3",
                    "modelId": "m1",
                    "scenarioId": "s1",
                    "sampleIndex": 2,
                    "summary": {"score": 5, "values": {}},
                    "decisionModelV2": {"canonical": {"direction": "favor_first", "strength": "strong"}},
                    "scenario": {},
                },
                {
                    "id": "t4",
                    "modelId": "m1",
                    "scenarioId": "s1",
                    "sampleIndex": 3,
                    "summary": {"score": 5, "values": {}},
                    "decisionModelV2": {"canonical": {"direction": "favor_first", "strength": "strong"}},
                    "scenario": {},
                },
                {
                    "id": "t5",
                    "modelId": "m1",
                    "scenarioId": "s2",
                    "sampleIndex": 0,
                    "summary": {"score": 3, "values": {}},
                    "decisionModelV2": {"canonical": {"direction": "neutral", "strength": "neutral"}},
                    "scenario": {},
                },
            ],
        }

        result = run_analyze_basic(input_data)

        assert result["success"] is True
        reliability = result["analysis"]["reliabilitySummary"]["perModel"]["m1"]

        assert reliability["coverageCount"] == 1
        assert reliability["perScenario"]["s1"]["trials"] == 6
        assert reliability["perScenario"]["s1"]["matches"] == 6
        assert "s2" not in reliability["perScenario"]

    def test_same_signature_aggregate_emits_per_pair_without_repeat_coverage(self):
        """Aggregate runs should still surface per-pair coherence inputs even with no repeats."""
        input_data = {
            "runId": "aggregate-run-per-pair-no-repeat",
            "emitVignetteSemantics": True,
            "aggregateSemantics": {
                "mode": "same_signature_v1",
                "plannedScenarioIds": ["s1"],
                "minRepeatCoverageCount": 1,
                "minRepeatCoverageShare": 0.1,
                "lowCoverageCautionThreshold": 5,
                "driftWarningThreshold": 0.25,
            },
            "valuePair": {
                "valueA": "ValueA",
                "valueB": "ValueB",
            },
            "targetCompanionRunId": "run-companion-1",
            "transcripts": [
                {
                    "id": "t1",
                    "runId": "source-run-1",
                    "modelId": "m1",
                    "scenarioId": "s1",
                    "sampleIndex": 0,
                    "orientationFlipped": False,
                    "summary": {"score": 3, "values": {}},
                    "decisionModelV2": {"canonical": {"direction": "neutral", "strength": "neutral"}},
                    "scenario": {"content": {"dimension_values": {"ValueA": "minimal", "ValueB": "negligible"}}},
                },
            ],
        }

        result = run_analyze_basic(input_data)

        assert result["success"] is True
        reliability = result["analysis"]["reliabilitySummary"]["perModel"]["m1"]
        per_pair = reliability["perPair"]["ValueA"]

        assert "perScenario" not in reliability
        assert per_pair["targetAnalysisRunId"] == "aggregate-run-per-pair-no-repeat"
        assert per_pair["targetCompanionRunId"] == "run-companion-1"
        assert per_pair["primaryConditionIds"] == ["s1"]
        assert per_pair["companionConditionIds"] == ["s1"]
        assert per_pair["perCondition"][0]["scenarioId"] == "s1"
        assert per_pair["perCondition"][0]["netPressureRank"] == 1
        assert per_pair["perCondition"][0]["winRate"] == pytest.approx(0.0, abs=1e-6)
        assert per_pair["perCondition"][0]["matches"] == 0
        assert per_pair["perCondition"][0]["trials"] == 1

    def test_same_signature_aggregate_sets_net_pressure_rank_to_null_for_noncanonical_labels(self):
        """Non-canonical condition labels should keep the pair indeterminate at the condition level."""
        input_data = {
            "runId": "aggregate-run-per-pair-null-rank",
            "emitVignetteSemantics": True,
            "aggregateSemantics": {
                "mode": "same_signature_v1",
                "plannedScenarioIds": ["s1"],
                "minRepeatCoverageCount": 1,
                "minRepeatCoverageShare": 0.1,
                "lowCoverageCautionThreshold": 5,
                "driftWarningThreshold": 0.25,
            },
            "valuePair": {
                "valueA": "ValueA",
                "valueB": "ValueB",
            },
            "targetCompanionRunId": "run-companion-2",
            "transcripts": [
                {
                    "id": "t1",
                    "runId": "source-run-2",
                    "modelId": "m1",
                    "scenarioId": "s1",
                    "sampleIndex": 0,
                    "orientationFlipped": False,
                    "summary": {"score": 5, "values": {}},
                    "decisionModelV2": {"canonical": {"direction": "favor_first", "strength": "strong"}},
                    "scenario": {"content": {"dimension_values": {"ValueA": "moderate", "ValueB": "mystery"}}},
                },
                {
                    "id": "t2",
                    "runId": "source-run-2",
                    "modelId": "m1",
                    "scenarioId": "s1",
                    "sampleIndex": 1,
                    "orientationFlipped": False,
                    "summary": {"score": 5, "values": {}},
                    "decisionModelV2": {"canonical": {"direction": "favor_first", "strength": "strong"}},
                    "scenario": {"content": {"dimension_values": {"ValueA": "moderate", "ValueB": "mystery"}}},
                },
            ],
        }

        result = run_analyze_basic(input_data)

        assert result["success"] is True
        per_pair = result["analysis"]["reliabilitySummary"]["perModel"]["m1"]["perPair"]["ValueA"]

        assert per_pair["perCondition"][0]["netPressureRank"] is None
        assert per_pair["perCondition"][0]["matches"] == 2
        assert per_pair["perCondition"][0]["trials"] == 2
        assert per_pair["perCondition"][0]["winRate"] == pytest.approx(1.0, abs=1e-6)

