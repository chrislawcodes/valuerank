"""Tests for variance analysis module."""

import pytest
from stats.variance_analysis import (
    compute_variance_stats,
    compute_consistency_score,
    compute_variance_analysis,
    VarianceStats,
    ModelVarianceStats,
    RunVarianceAnalysis,
)


class TestVarianceStats:
    """Tests for compute_variance_stats function."""

    def test_basic_variance(self):
        """Test variance computation for a simple set of scores."""
        scores = [1.0, 2.0, 3.0, 4.0, 5.0]
        stats = compute_variance_stats(scores)

        assert stats["sampleCount"] == 5
        assert stats["mean"] == pytest.approx(3.0, abs=0.001)
        assert stats["min"] == 1.0
        assert stats["max"] == 5.0
        assert stats["range"] == 4.0
        # Sample std dev: sqrt(sum((x-mean)^2)/(n-1))
        # = sqrt(10/4) = sqrt(2.5) ≈ 1.581
        assert stats["stdDev"] == pytest.approx(1.581, abs=0.01)
        assert stats["variance"] == pytest.approx(2.5, abs=0.01)

    def test_identical_scores(self):
        """Test variance is zero when all scores are identical."""
        scores = [3.0, 3.0, 3.0, 3.0]
        stats = compute_variance_stats(scores)

        assert stats["sampleCount"] == 4
        assert stats["mean"] == 3.0
        assert stats["stdDev"] == 0.0
        assert stats["variance"] == 0.0
        assert stats["range"] == 0.0

    def test_empty_list(self):
        """Test handling of empty score list."""
        stats = compute_variance_stats([])

        assert stats["sampleCount"] == 0
        assert stats["mean"] == 0.0
        assert stats["stdDev"] == 0.0
        assert stats["variance"] == 0.0

    def test_single_value(self):
        """Test handling of single value (no variance possible)."""
        stats = compute_variance_stats([4.0])

        assert stats["sampleCount"] == 1
        assert stats["mean"] == 4.0
        assert stats["stdDev"] == 0.0  # Can't compute with n=1
        assert stats["variance"] == 0.0


class TestConsistencyScore:
    """Tests for compute_consistency_score function."""

    def test_perfect_consistency(self):
        """Test consistency score is 1.0 when variance is zero."""
        variances = [0.0, 0.0, 0.0]
        score = compute_consistency_score(variances)
        assert score == 1.0

    def test_maximum_variance(self):
        """Test consistency score approaches 0 with maximum variance."""
        # Max variance for 1-5 scale is 4.0 (distance from mean at edge)
        variances = [4.0, 4.0, 4.0]
        score = compute_consistency_score(variances)
        assert score == 0.0

    def test_moderate_variance(self):
        """Test consistency score scales linearly with variance."""
        variances = [1.0, 1.0]  # 25% of max variance
        score = compute_consistency_score(variances)
        assert score == pytest.approx(0.75, abs=0.001)

    def test_empty_variances(self):
        """Test empty list returns 1.0 (consistent by default)."""
        score = compute_consistency_score([])
        assert score == 1.0


class TestVarianceAnalysis:
    """Tests for compute_variance_analysis function."""

    def test_single_sample_run(self):
        """Test that single-sample runs return isMultiSample=False."""
        transcripts = [
            {
                "scenarioId": "s1",
                "modelId": "m1",
                "sampleIndex": 0,
                "summary": {"score": 3},
                "scenario": {"name": "Test Scenario"},
            }
        ]
        analysis = compute_variance_analysis(transcripts)

        assert analysis["isMultiSample"] is False
        assert analysis["samplesPerScenario"] == 1
        assert len(analysis["mostVariableScenarios"]) == 0

    def test_multi_sample_run(self):
        """Test multi-sample run with variance computation."""
        transcripts = [
            # Model 1, Scenario 1: 3 samples with scores 2, 3, 4
            {"scenarioId": "s1", "modelId": "m1", "sampleIndex": 0, "summary": {"score": 2}, "scenario": {"name": "Scenario 1"}},
            {"scenarioId": "s1", "modelId": "m1", "sampleIndex": 1, "summary": {"score": 3}, "scenario": {"name": "Scenario 1"}},
            {"scenarioId": "s1", "modelId": "m1", "sampleIndex": 2, "summary": {"score": 4}, "scenario": {"name": "Scenario 1"}},
            # Model 2, Scenario 1: 3 samples with identical scores (no variance)
            {"scenarioId": "s1", "modelId": "m2", "sampleIndex": 0, "summary": {"score": 3}, "scenario": {"name": "Scenario 1"}},
            {"scenarioId": "s1", "modelId": "m2", "sampleIndex": 1, "summary": {"score": 3}, "scenario": {"name": "Scenario 1"}},
            {"scenarioId": "s1", "modelId": "m2", "sampleIndex": 2, "summary": {"score": 3}, "scenario": {"name": "Scenario 1"}},
        ]
        analysis = compute_variance_analysis(transcripts)

        assert analysis["isMultiSample"] is True
        assert analysis["samplesPerScenario"] == 3

        # Check per-model stats
        assert "m1" in analysis["perModel"]
        assert "m2" in analysis["perModel"]

        m1_stats = analysis["perModel"]["m1"]
        assert m1_stats["totalSamples"] == 3
        assert m1_stats["uniqueScenarios"] == 1
        assert m1_stats["avgWithinScenarioVariance"] > 0

        m2_stats = analysis["perModel"]["m2"]
        assert m2_stats["avgWithinScenarioVariance"] == 0  # All identical scores
        assert m2_stats["consistencyScore"] == 1.0  # Perfect consistency

    def test_most_variable_scenarios(self):
        """Test that most variable scenarios are correctly identified."""
        transcripts = [
            # High variance scenario
            {"scenarioId": "high_var", "modelId": "m1", "sampleIndex": 0, "summary": {"score": 1}, "scenario": {"name": "High Variance"}},
            {"scenarioId": "high_var", "modelId": "m1", "sampleIndex": 1, "summary": {"score": 5}, "scenario": {"name": "High Variance"}},
            # Low variance scenario
            {"scenarioId": "low_var", "modelId": "m1", "sampleIndex": 0, "summary": {"score": 3}, "scenario": {"name": "Low Variance"}},
            {"scenarioId": "low_var", "modelId": "m1", "sampleIndex": 1, "summary": {"score": 3}, "scenario": {"name": "Low Variance"}},
        ]
        analysis = compute_variance_analysis(transcripts)

        # Most variable should list high_var first
        assert len(analysis["mostVariableScenarios"]) > 0
        most_var = analysis["mostVariableScenarios"][0]
        assert most_var["scenarioId"] == "high_var"
        assert most_var["variance"] > 0

    def test_missing_scores(self):
        """Test handling of transcripts with missing scores."""
        transcripts = [
            {"scenarioId": "s1", "modelId": "m1", "sampleIndex": 0, "summary": {"score": 3}, "scenario": {"name": "Test"}},
            {"scenarioId": "s1", "modelId": "m1", "sampleIndex": 1, "summary": {"score": None}, "scenario": {"name": "Test"}},
            {"scenarioId": "s1", "modelId": "m1", "sampleIndex": 2, "summary": {"score": 4}, "scenario": {"name": "Test"}},
        ]
        analysis = compute_variance_analysis(transcripts)

        # Should only compute variance from non-null scores
        m1_stats = analysis["perModel"]["m1"]
        # 2 valid samples out of 3
        assert m1_stats["totalSamples"] == 2


class TestIntegration:
    """Integration tests for complete variance analysis pipeline."""

    def test_full_multi_sample_analysis(self):
        """Test complete analysis with multiple models and scenarios."""
        transcripts = []
        models = ["claude", "gpt4", "gemini"]
        scenarios = ["ethics_1", "ethics_2", "ethics_3"]

        # Create 5 samples per model-scenario pair
        for model in models:
            for i, scenario in enumerate(scenarios):
                base_score = 3 + i * 0.5  # Slightly different base per scenario
                for sample_idx in range(5):
                    # Add some variance
                    score = base_score + (sample_idx - 2) * 0.2
                    transcripts.append({
                        "scenarioId": scenario,
                        "modelId": model,
                        "sampleIndex": sample_idx,
                        "summary": {"score": score},
                        "scenario": {"name": f"Ethics Test {i + 1}"},
                    })

        analysis = compute_variance_analysis(transcripts)

        assert analysis["isMultiSample"] is True
        assert analysis["samplesPerScenario"] == 5
        assert len(analysis["perModel"]) == 3

        for model in models:
            stats = analysis["perModel"][model]
            assert stats["totalSamples"] == 15  # 5 samples * 3 scenarios
            assert stats["uniqueScenarios"] == 3
            assert 0 <= stats["consistencyScore"] <= 1
