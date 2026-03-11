"""
Integration tests for analyze_basic.py worker.

Tests the full analysis pipeline with realistic transcript data.
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest


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


class TestAnalyzeBasicIntegration:
    """Integration tests for analyze_basic worker."""

    def test_single_transcript(self):
        """Test analysis with single transcript."""
        input_data = {
            "runId": "test-run-1",
            "transcripts": [
                {
                    "id": "t1",
                    "modelId": "gpt-4",
                    "scenarioId": "s1",
                    "summary": {
                        "values": {"Physical_Safety": "prioritized"},
                        "score": 0.8,
                    },
                    "scenario": {"dimensions": {"stakes": "high"}},
                }
            ],
        }
        result = run_analyze_basic(input_data)

        assert result["success"] is True
        assert "analysis" in result
        assert "perModel" in result["analysis"]
        assert "gpt-4" in result["analysis"]["perModel"]
        assert result["analysis"]["perModel"]["gpt-4"]["sampleSize"] == 1

    def test_multiple_models(self):
        """Test analysis with multiple models."""
        input_data = {
            "runId": "test-run-2",
            "transcripts": [
                {
                    "id": "t1",
                    "modelId": "gpt-4",
                    "scenarioId": "s1",
                    "summary": {"values": {"Compassion": "prioritized"}, "score": 0.7},
                    "scenario": {"dimensions": {"stakes": "low"}},
                },
                {
                    "id": "t2",
                    "modelId": "claude-3",
                    "scenarioId": "s1",
                    "summary": {"values": {"Compassion": "deprioritized"}, "score": 0.3},
                    "scenario": {"dimensions": {"stakes": "low"}},
                },
                {
                    "id": "t3",
                    "modelId": "gpt-4",
                    "scenarioId": "s2",
                    "summary": {"values": {"Compassion": "prioritized"}, "score": 0.8},
                    "scenario": {"dimensions": {"stakes": "high"}},
                },
                {
                    "id": "t4",
                    "modelId": "claude-3",
                    "scenarioId": "s2",
                    "summary": {"values": {"Compassion": "prioritized"}, "score": 0.9},
                    "scenario": {"dimensions": {"stakes": "high"}},
                },
            ],
        }
        result = run_analyze_basic(input_data)

        assert result["success"] is True
        analysis = result["analysis"]

        # Check per-model stats
        assert "gpt-4" in analysis["perModel"]
        assert "claude-3" in analysis["perModel"]
        assert analysis["perModel"]["gpt-4"]["sampleSize"] == 2
        assert analysis["perModel"]["claude-3"]["sampleSize"] == 2

        # Check model agreement
        assert "pairwise" in analysis["modelAgreement"]
        # Should have one pairwise comparison
        assert len(analysis["modelAgreement"]["pairwise"]) == 1

        # Check dimension analysis
        assert "dimensions" in analysis["dimensionAnalysis"]
        assert "stakes" in analysis["dimensionAnalysis"]["dimensions"]

    def test_contested_scenarios(self):
        """Test that contested scenarios are identified."""
        input_data = {
            "runId": "test-run-3",
            "transcripts": [
                # Scenario with high disagreement
                {"id": "t1", "modelId": "m1", "scenarioId": "contested",
                 "summary": {"score": 0.1}, "scenario": {"name": "Contested One"}},
                {"id": "t2", "modelId": "m2", "scenarioId": "contested",
                 "summary": {"score": 0.9}, "scenario": {"name": "Contested One"}},
                # Scenario with low disagreement
                {"id": "t3", "modelId": "m1", "scenarioId": "agreed",
                 "summary": {"score": 0.5}, "scenario": {"name": "Agreed One"}},
                {"id": "t4", "modelId": "m2", "scenarioId": "agreed",
                 "summary": {"score": 0.5}, "scenario": {"name": "Agreed One"}},
            ],
        }
        result = run_analyze_basic(input_data)

        assert result["success"] is True
        contested = result["analysis"]["mostContestedScenarios"]
        assert len(contested) >= 1
        # Contested scenario should be first (higher variance)
        assert contested[0]["scenarioId"] == "contested"
        assert contested[0]["variance"] > 0

    def test_warnings_for_small_samples(self):
        """Test that warnings are generated for small samples."""
        input_data = {
            "runId": "test-run-4",
            "transcripts": [
                {"id": "t1", "modelId": "small-model", "scenarioId": "s1",
                 "summary": {"values": {}, "score": 0.5}, "scenario": {}},
            ],
        }
        result = run_analyze_basic(input_data)

        assert result["success"] is True
        warnings = result["analysis"]["warnings"]
        # Should have small sample warning
        warning_codes = [w["code"] for w in warnings]
        assert "SMALL_SAMPLE" in warning_codes

    def test_methods_documented(self):
        """Test that statistical methods are documented in output."""
        input_data = {
            "runId": "test-run-5",
            "transcripts": [
                {"id": "t1", "modelId": "m1", "scenarioId": "s1",
                 "summary": {"values": {}, "score": 0.5}, "scenario": {}},
            ],
        }
        result = run_analyze_basic(input_data)

        assert result["success"] is True
        methods = result["analysis"]["methodsUsed"]
        assert methods["winRateCI"] == "wilson_score"
        assert methods["modelComparison"] == "spearman_rho"
        assert methods["pValueCorrection"] == "holm_bonferroni"
        assert methods["effectSize"] == "cohens_d"
        assert methods["alpha"] == 0.05
        assert "codeVersion" in methods

    def test_legacy_mode_with_transcript_ids(self):
        """Test backwards compatibility with transcriptIds only."""
        input_data = {
            "runId": "test-run-6",
            "transcriptIds": ["id1", "id2", "id3"],
        }
        result = run_analyze_basic(input_data)

        assert result["success"] is True
        assert result["analysis"]["status"] == "STUB"
        assert result["analysis"]["transcriptCount"] == 3

    def test_empty_transcripts(self):
        """Test analysis with empty transcripts array."""
        input_data = {
            "runId": "test-run-7",
            "transcripts": [],
        }
        result = run_analyze_basic(input_data)

        assert result["success"] is True
        assert result["analysis"]["perModel"] == {}

    def test_preference_summary_uses_orientation_corrected_scenario_means(self):
        """Preference strength should use per-scenario means, not flattened repeats."""
        input_data = {
            "runId": "test-run-preference-summary",
            "transcripts": [
                {
                    "id": "t1",
                    "modelId": "m1",
                    "scenarioId": "s1",
                    "sampleIndex": 0,
                    "orientationFlipped": False,
                    "summary": {"score": 5, "values": {}},
                    "scenario": {},
                },
                {
                    "id": "t2",
                    "modelId": "m1",
                    "scenarioId": "s1",
                    "sampleIndex": 1,
                    "orientationFlipped": False,
                    "summary": {"score": 5, "values": {}},
                    "scenario": {},
                },
                {
                    "id": "t3",
                    "modelId": "m1",
                    "scenarioId": "s2",
                    "sampleIndex": 0,
                    "orientationFlipped": True,
                    "summary": {"score": 1, "values": {}},
                    "scenario": {},
                },
                {
                    "id": "t4",
                    "modelId": "m1",
                    "scenarioId": "s3",
                    "sampleIndex": 0,
                    "orientationFlipped": False,
                    "summary": {"score": 3, "values": {}},
                    "scenario": {},
                },
            ],
        }

        result = run_analyze_basic(input_data)

        assert result["success"] is True
        summary = result["analysis"]["preferenceSummary"]["perModel"]["m1"]
        direction = summary["preferenceDirection"]

        assert direction["overallLean"] == "A"
        assert direction["overallSignedCenter"] == pytest.approx(1.333333, abs=1e-6)
        assert summary["preferenceStrength"] == pytest.approx(1.333333, abs=1e-6)

    def test_reliability_summary_is_unavailable_without_repeats(self):
        """Single-sample runs should not expose reliability from cross-scenario spread."""
        input_data = {
            "runId": "test-run-reliability-unavailable",
            "transcripts": [
                {
                    "id": "t1",
                    "modelId": "m1",
                    "scenarioId": "s1",
                    "sampleIndex": 0,
                    "summary": {"score": 1, "values": {}},
                    "scenario": {},
                },
                {
                    "id": "t2",
                    "modelId": "m1",
                    "scenarioId": "s2",
                    "sampleIndex": 0,
                    "summary": {"score": 5, "values": {}},
                    "scenario": {},
                },
            ],
        }

        result = run_analyze_basic(input_data)

        assert result["success"] is True
        reliability = result["analysis"]["reliabilitySummary"]["perModel"]["m1"]
        variance = result["analysis"]["varianceAnalysis"]["perModel"]["m1"]

        assert variance["consistencyScore"] == 1.0
        assert reliability["coverageCount"] == 0
        assert reliability["baselineNoise"] is None
        assert reliability["baselineReliability"] is None
        assert reliability["directionalAgreement"] is None
        assert reliability["neutralShare"] is None

    def test_reliability_summary_weights_directional_metrics_by_sample_count(self):
        """Directional reliability rollups should be weighted by repeated sample count."""
        input_data = {
            "runId": "test-run-reliability-weighted",
            "transcripts": [
                {
                    "id": "t1",
                    "modelId": "m1",
                    "scenarioId": "s1",
                    "sampleIndex": 0,
                    "summary": {"score": 5, "values": {}},
                    "scenario": {},
                },
                {
                    "id": "t2",
                    "modelId": "m1",
                    "scenarioId": "s1",
                    "sampleIndex": 1,
                    "summary": {"score": 5, "values": {}},
                    "scenario": {},
                },
                {
                    "id": "t3",
                    "modelId": "m1",
                    "scenarioId": "s1",
                    "sampleIndex": 2,
                    "summary": {"score": 3, "values": {}},
                    "scenario": {},
                },
                {
                    "id": "t4",
                    "modelId": "m1",
                    "scenarioId": "s2",
                    "sampleIndex": 0,
                    "summary": {"score": 1, "values": {}},
                    "scenario": {},
                },
                {
                    "id": "t5",
                    "modelId": "m1",
                    "scenarioId": "s2",
                    "sampleIndex": 1,
                    "summary": {"score": 1, "values": {}},
                    "scenario": {},
                },
            ],
        }

        result = run_analyze_basic(input_data)

        assert result["success"] is True
        reliability = result["analysis"]["reliabilitySummary"]["perModel"]["m1"]
        variance = result["analysis"]["varianceAnalysis"]["perModel"]["m1"]

        assert reliability["coverageCount"] == 2
        assert reliability["uniqueScenarios"] == 2
        assert reliability["baselineReliability"] == pytest.approx(
            variance["consistencyScore"],
            abs=1e-6,
        )
        assert reliability["baselineNoise"] == pytest.approx(
            variance["avgWithinScenarioVariance"] ** 0.5,
            abs=1e-6,
        )
        assert reliability["directionalAgreement"] == pytest.approx(0.8, abs=1e-6)
        assert reliability["neutralShare"] == pytest.approx(0.2, abs=1e-6)

    def test_summaries_are_suppressed_when_vignette_semantics_are_disabled(self):
        """Assumption-style runs should not emit baseline semantic summaries."""
        input_data = {
            "runId": "test-run-assumption-suppressed",
            "emitVignetteSemantics": False,
            "transcripts": [
                {
                    "id": "t1",
                    "modelId": "m1",
                    "scenarioId": "s1",
                    "sampleIndex": 0,
                    "summary": {"score": 5, "values": {"Value_A": "prioritized"}},
                    "scenario": {},
                },
                {
                    "id": "t2",
                    "modelId": "m1",
                    "scenarioId": "s1",
                    "sampleIndex": 1,
                    "summary": {"score": 4, "values": {"Value_A": "prioritized"}},
                    "scenario": {},
                },
            ],
        }

        result = run_analyze_basic(input_data)

        assert result["success"] is True
        analysis = result["analysis"]
        assert analysis["preferenceSummary"] is None
        assert analysis["reliabilitySummary"] is None
        assert analysis["perModel"]["m1"]["sampleSize"] == 2
        assert analysis["varianceAnalysis"]["perModel"]["m1"]["uniqueScenarios"] == 1

    def test_missing_run_id(self):
        """Test error when runId is missing."""
        input_data = {
            "transcripts": [],
        }
        result = run_analyze_basic(input_data)

        assert result["success"] is False
        assert "runId" in result["error"]["message"]

    def test_invalid_json(self):
        """Test error handling for invalid JSON."""
        workers_dir = Path(__file__).parent.parent
        result = subprocess.run(
            [sys.executable, "analyze_basic.py"],
            input="not valid json",
            capture_output=True,
            text=True,
            cwd=workers_dir,
            env={**dict(__import__("os").environ), "PYTHONPATH": str(workers_dir)},
        )
        output = json.loads(result.stdout)
        assert output["success"] is False
        assert "JSON" in output["error"]["message"]

    def test_win_rate_calculation(self):
        """Test win rate is calculated correctly."""
        input_data = {
            "runId": "test-run-8",
            "transcripts": [
                {"id": "t1", "modelId": "m1", "scenarioId": "s1",
                 "summary": {"values": {"Value_A": "prioritized"}}, "scenario": {}},
                {"id": "t2", "modelId": "m1", "scenarioId": "s2",
                 "summary": {"values": {"Value_A": "prioritized"}}, "scenario": {}},
                {"id": "t3", "modelId": "m1", "scenarioId": "s3",
                 "summary": {"values": {"Value_A": "deprioritized"}}, "scenario": {}},
                {"id": "t4", "modelId": "m1", "scenarioId": "s4",
                 "summary": {"values": {"Value_A": "prioritized"}}, "scenario": {}},
            ],
        }
        result = run_analyze_basic(input_data)

        assert result["success"] is True
        value_stats = result["analysis"]["perModel"]["m1"]["values"]["Value_A"]
        # 3 prioritized, 1 deprioritized = 75% win rate
        assert value_stats["winRate"] == pytest.approx(0.75, abs=0.01)
        assert value_stats["count"]["prioritized"] == 3
        assert value_stats["count"]["deprioritized"] == 1

    def test_dimension_impact(self):
        """Test dimension impact analysis."""
        input_data = {
            "runId": "test-run-9",
            "transcripts": [
                {"id": "t1", "modelId": "m1", "scenarioId": "s1",
                 "summary": {"score": 0.2}, "scenario": {"dimensions": {"stakes": "low"}}},
                {"id": "t2", "modelId": "m1", "scenarioId": "s2",
                 "summary": {"score": 0.3}, "scenario": {"dimensions": {"stakes": "low"}}},
                {"id": "t3", "modelId": "m1", "scenarioId": "s3",
                 "summary": {"score": 0.8}, "scenario": {"dimensions": {"stakes": "high"}}},
                {"id": "t4", "modelId": "m1", "scenarioId": "s4",
                 "summary": {"score": 0.9}, "scenario": {"dimensions": {"stakes": "high"}}},
            ],
        }
        result = run_analyze_basic(input_data)

        assert result["success"] is True
        dim_analysis = result["analysis"]["dimensionAnalysis"]
        assert "stakes" in dim_analysis["dimensions"]
        # Stakes should have significant effect
        assert dim_analysis["dimensions"]["stakes"]["effectSize"] > 0.5

    def test_output_includes_timestamp(self):
        """Test that output includes timestamp and duration."""
        input_data = {
            "runId": "test-run-10",
            "transcripts": [],
        }
        result = run_analyze_basic(input_data)

        assert result["success"] is True
        assert "computedAt" in result["analysis"]
        assert "durationMs" in result["analysis"]
        assert result["analysis"]["durationMs"] >= 0


class TestAnalyzeBasicEdgeCases:
    """Edge case tests for analyze_basic worker."""

    def test_missing_score_in_summary(self):
        """Test handling of transcripts without scores."""
        input_data = {
            "runId": "test-edge-1",
            "transcripts": [
                {"id": "t1", "modelId": "m1", "scenarioId": "s1",
                 "summary": {"values": {"V": "prioritized"}}, "scenario": {}},
            ],
        }
        result = run_analyze_basic(input_data)
        assert result["success"] is True

    def test_missing_summary(self):
        """Test handling of transcripts without summary."""
        input_data = {
            "runId": "test-edge-2",
            "transcripts": [
                {"id": "t1", "modelId": "m1", "scenarioId": "s1", "scenario": {}},
            ],
        }
        result = run_analyze_basic(input_data)
        assert result["success"] is True

    def test_missing_scenario(self):
        """Test handling of transcripts without scenario."""
        input_data = {
            "runId": "test-edge-3",
            "transcripts": [
                {"id": "t1", "modelId": "m1", "scenarioId": "s1",
                 "summary": {"values": {}}},
            ],
        }
        result = run_analyze_basic(input_data)
        assert result["success"] is True
