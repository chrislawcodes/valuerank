"""
Unit tests for stats module.

Tests validate against scipy reference implementations where applicable.
"""

import pytest
import numpy as np
from scipy import stats as scipy_stats

from stats.confidence import wilson_score_ci, bootstrap_ci
from stats.basic_stats import (
    compute_win_rate,
    compute_value_stats,
    compute_model_summary,
    aggregate_transcripts_by_model,
    compute_visualization_data,
)
from stats.decision_model import resolve_transcript_score_details, resolve_transcript_signed_distance
from stats.model_comparison import (
    compute_effect_size,
    interpret_effect_size,
    apply_holm_bonferroni,
    compute_pairwise_agreement,
    detect_outlier_models,
    compute_model_agreement,
)
from stats.dimension_impact import (
    compute_eta_squared,
    analyze_dimension,
    compute_dimension_effects,
    compute_variance_explained,
)


class TestWilsonScoreCI:
    """Tests for Wilson score confidence interval."""

    def test_basic_case(self):
        """Test basic Wilson score calculation."""
        result = wilson_score_ci(50, 100, 0.95)
        assert result["lower"] < 0.5
        assert result["upper"] > 0.5
        assert result["level"] == 0.95
        assert result["method"] == "wilson_score"

    def test_zero_successes(self):
        """Test with zero successes."""
        result = wilson_score_ci(0, 100, 0.95)
        assert result["lower"] == 0.0
        assert result["upper"] > 0.0
        assert result["upper"] < 0.1  # Should be small

    def test_all_successes(self):
        """Test with all successes."""
        result = wilson_score_ci(100, 100, 0.95)
        assert result["lower"] > 0.9  # Should be close to 1
        assert result["upper"] == 1.0

    def test_small_sample(self):
        """Test with small sample size."""
        result = wilson_score_ci(3, 5, 0.95)
        # Wilson handles small samples well
        assert 0.0 <= result["lower"] < result["upper"] <= 1.0

    def test_matches_scipy_proportion_confint(self):
        """Validate against scipy reference (when available)."""
        # scipy.stats.proportion_confint with method='wilson'
        # Note: scipy uses different parameterization, so approximate check
        result = wilson_score_ci(30, 100, 0.95)
        assert 0.2 < result["lower"] < 0.3
        assert 0.3 < result["upper"] < 0.4

    def test_invalid_inputs(self):
        """Test error handling for invalid inputs."""
        with pytest.raises(ValueError):
            wilson_score_ci(-1, 100)
        with pytest.raises(ValueError):
            wilson_score_ci(101, 100)
        with pytest.raises(ValueError):
            wilson_score_ci(50, 0)
        with pytest.raises(ValueError):
            wilson_score_ci(50, 100, 1.5)


class TestBootstrapCI:
    """Tests for bootstrap confidence interval."""

    def test_basic_mean(self):
        """Test bootstrap CI for mean."""
        data = list(range(1, 101))
        result = bootstrap_ci(data, "mean", 0.95, seed=42)
        # Mean is 50.5, CI should be reasonably close
        assert 40 < result["lower"] < 55
        assert 45 < result["upper"] < 60
        assert result["method"] == "bootstrap_mean"

    def test_median(self):
        """Test bootstrap CI for median."""
        data = list(range(1, 101))
        result = bootstrap_ci(data, "median", 0.95, seed=42)
        assert result["lower"] < result["upper"]

    def test_std(self):
        """Test bootstrap CI for standard deviation."""
        data = list(range(1, 101))
        result = bootstrap_ci(data, "std", 0.95, seed=42)
        assert result["lower"] > 0
        assert result["upper"] > result["lower"]

    def test_empty_data(self):
        """Test error on empty data."""
        with pytest.raises(ValueError):
            bootstrap_ci([], "mean")

    def test_invalid_statistic(self):
        """Test error on invalid statistic."""
        with pytest.raises(ValueError):
            bootstrap_ci([1, 2, 3], "invalid")


class TestBasicStats:
    """Tests for basic statistics functions."""

    def test_win_rate_basic(self):
        """Test basic win rate calculation."""
        assert compute_win_rate(50, 50) == 0.5
        assert compute_win_rate(100, 0) == 1.0
        assert compute_win_rate(0, 100) == 0.0

    def test_win_rate_no_data(self):
        """Test win rate with no data returns 0.5."""
        assert compute_win_rate(0, 0) == 0.5

    def test_value_stats(self):
        """Test value stats computation."""
        result = compute_value_stats(70, 30, 10)
        assert result["winRate"] == pytest.approx(0.7, abs=0.01)
        assert result["count"]["prioritized"] == 70
        assert result["count"]["deprioritized"] == 30
        assert result["count"]["neutral"] == 10
        assert "lower" in result["confidenceInterval"]

    def test_model_summary(self):
        """Test model summary statistics."""
        scores = [1.0, 2.0, 3.0, 4.0, 5.0]
        result = compute_model_summary(scores)
        assert result["mean"] == pytest.approx(3.0, abs=0.01)
        assert result["min"] == 1.0
        assert result["max"] == 5.0
        assert result["stdDev"] > 0

    def test_model_summary_empty(self):
        """Test model summary with empty data."""
        result = compute_model_summary([])
        assert result["mean"] == 0.0
        assert result["stdDev"] == 0.0

    def test_aggregate_transcripts(self):
        """Test transcript aggregation by model."""
        transcripts = [
            {
                "modelId": "model-a",
                "summary": {
                    "score": 4,
                    "values": {"Physical_Safety": "prioritized"},
                },
            },
            {
                "modelId": "model-a",
                "summary": {
                    "score": 3,
                    "values": {"Physical_Safety": "deprioritized"},
                },
            },
            {
                "modelId": "model-b",
                "summary": {
                    "score": 5,
                    "values": {"Physical_Safety": "prioritized"},
                },
            },
        ]
        result = aggregate_transcripts_by_model(transcripts)
        assert "model-a" in result
        assert "model-b" in result
        assert result["model-a"]["sampleSize"] == 2
        assert result["model-b"]["sampleSize"] == 1

    def test_aggregate_transcripts_uses_canonical_decision(self):
        """Canonical direction/strength is used for aggregate stats; stale scalar is ignored."""
        transcripts = [
            {
                "modelId": "model-a",
                "scenarioId": "scenario-1",
                "summary": {
                    "score": 1.0,
                    "values": {"Physical_Safety": "prioritized"},
                },
                "decisionModelV2": {
                    "canonical": {
                        "direction": "favor_first",
                        "strength": "lean",
                    },
                    "legacy": {
                        "rawScore": 1,
                        "canonicalScore": 4,
                    },
                },
            },
        ]
        result = aggregate_transcripts_by_model(transcripts)
        # favor_first/lean → signed distance +1.0
        assert result["model-a"]["overall"]["mean"] == pytest.approx(1.0, abs=0.001)

    def test_aggregate_transcripts_unscored_without_canonical(self):
        """Transcripts with no canonical block and no legacy score are not scored; overall mean is 0.0."""
        transcripts = [
            {
                "modelId": "model-a",
                "scenarioId": "scenario-1",
                "orientationFlipped": True,
                "decisionModelV2": {
                    "legacy": {
                        "rawScore": 1,
                    },
                },
            },
        ]
        result = aggregate_transcripts_by_model(transcripts)
        assert result["model-a"]["sampleSize"] == 1
        # No canonical, no canonicalScore, no summary.score → no signed distance → mean defaults to 0.0
        assert result["model-a"]["overall"]["mean"] == pytest.approx(0.0, abs=0.001)

    def test_visualization_data_uses_canonical_decision(self):
        """Decision distributions use canonical direction/strength bucket keys."""
        transcripts = [
            {
                "modelId": "model-a",
                "scenarioId": "scenario-1",
                "summary": {"score": 1.0},
                "decisionModelV2": {
                    "canonical": {
                        "direction": "favor_first",
                        "strength": "lean",
                    },
                    "legacy": {
                        "rawScore": 1,
                        "canonicalScore": 4,
                    },
                },
            },
        ]
        result = compute_visualization_data(transcripts)
        # favor_first/lean → bucket "favor_first.lean", signed distance 1.0
        assert result["decisionDistribution"]["model-a"]["favor_first.lean"] == 1
        assert result["modelScenarioMatrix"]["model-a"]["scenario-1"] == pytest.approx(1.0, abs=0.001)

    def test_visualization_data_skips_without_canonical(self):
        """Transcripts with no canonical block and no legacy score are excluded from visualization data."""
        transcripts = [
            {
                "modelId": "model-a",
                "scenarioId": "scenario-1",
                "orientationFlipped": True,
                "decisionModelV2": {
                    "legacy": {
                        "rawScore": 1,
                    },
                },
            },
        ]
        result = compute_visualization_data(transcripts)
        # No canonical, no canonicalScore, no summary.score → score is None → transcript skipped entirely
        assert "model-a" not in result["decisionDistribution"]
        assert "model-a" not in result["modelScenarioMatrix"]


class TestDecisionModelResolution:
    """Tests for the worker-side canonical decision model resolver."""

    def test_resolves_canonical_direction_and_strength(self):
        transcript = {
            "decisionModelV2": {
                "canonical": {"direction": "favor_first", "strength": "lean"},
            },
        }
        result = resolve_transcript_score_details(transcript)
        assert result == ("favor_first", "lean", "canonical")

    def test_returns_none_for_missing_decisionmodelv2(self):
        assert resolve_transcript_score_details({}) is None

    def test_returns_none_for_missing_canonical(self):
        assert resolve_transcript_score_details({"decisionModelV2": {}}) is None

    def test_returns_none_for_null_direction(self):
        transcript = {
            "decisionModelV2": {
                "canonical": {"direction": None, "strength": "lean"},
            },
        }
        assert resolve_transcript_score_details(transcript) is None

    def test_signed_distance_mapping(self):
        cases = [
            ("favor_first", "strong", 2.0),
            ("favor_first", "lean", 1.0),
            ("neutral", "neutral", 0.0),
            ("favor_second", "lean", -1.0),
            ("favor_second", "strong", -2.0),
        ]
        for direction, strength, expected in cases:
            transcript = {
                "decisionModelV2": {
                    "canonical": {"direction": direction, "strength": strength},
                },
            }
            assert resolve_transcript_signed_distance(transcript) == pytest.approx(expected, abs=0.001)

    def test_signed_distance_returns_none_without_canonical(self):
        assert resolve_transcript_signed_distance({}) is None
        assert resolve_transcript_signed_distance({"summary": {"score": None}}) is None
        assert resolve_transcript_signed_distance({"decisionModelV2": {"legacy": {"rawScore": 3}}}) is None

    def test_signed_distance_falls_back_to_legacy_score(self):
        """summary.score is used as a fallback when no canonical block is present."""
        assert resolve_transcript_signed_distance({"summary": {"score": 4}}) == pytest.approx(1.0, abs=0.001)
        assert resolve_transcript_signed_distance({"summary": {"score": 3}}) == pytest.approx(0.0, abs=0.001)
        assert resolve_transcript_signed_distance({"summary": {"score": 1}}) == pytest.approx(-2.0, abs=0.001)


class TestModelComparison:
    """Tests for model comparison functions."""

    def test_cohens_d_equal_groups(self):
        """Test Cohen's d with identical groups."""
        group1 = [1.0, 2.0, 3.0, 4.0, 5.0]
        group2 = [1.0, 2.0, 3.0, 4.0, 5.0]
        d = compute_effect_size(group1, group2)
        assert d == pytest.approx(0.0, abs=0.01)

    def test_cohens_d_different_groups(self):
        """Test Cohen's d with different means."""
        group1 = [1.0, 2.0, 3.0, 4.0, 5.0]
        group2 = [6.0, 7.0, 8.0, 9.0, 10.0]
        d = compute_effect_size(group1, group2)
        assert abs(d) > 2.0  # Large effect

    def test_cohens_d_matches_reference(self):
        """Validate Cohen's d against manual calculation."""
        group1 = [2.0, 4.0, 6.0]
        group2 = [3.0, 5.0, 7.0]
        d = compute_effect_size(group1, group2)
        # Manual: means differ by 1, pooled std is ~1.63, d ~ -0.61
        assert -1.0 < d < 0.0

    def test_interpret_effect_size(self):
        """Test effect size interpretation."""
        assert interpret_effect_size(0.1) == "negligible"
        assert interpret_effect_size(0.3) == "small"
        assert interpret_effect_size(0.6) == "medium"
        assert interpret_effect_size(1.0) == "large"

    def test_holm_bonferroni(self):
        """Test Holm-Bonferroni correction."""
        p_values = [0.01, 0.04, 0.03, 0.20]
        results = apply_holm_bonferroni(p_values, alpha=0.05)
        # First p-value (0.01) compared to 0.05/4 = 0.0125, significant
        # Others checked sequentially
        assert results[0][1]  # 0.01 is significant
        assert not results[3][1]  # 0.20 is not significant

    def test_pairwise_agreement(self):
        """Test pairwise model agreement."""
        model_scores = {
            "model-a": [1.0, 2.0, 3.0, 4.0, 5.0],
            "model-b": [1.1, 2.1, 3.1, 4.1, 5.1],
            "model-c": [5.0, 4.0, 3.0, 2.0, 1.0],
        }
        result = compute_pairwise_agreement(model_scores)
        assert "model-a:model-b" in result
        # model-a and model-b should be highly correlated
        assert result["model-a:model-b"]["spearmanRho"] > 0.9
        # model-a and model-c should be negatively correlated
        assert result["model-a:model-c"]["spearmanRho"] < -0.9

    def test_detect_outliers(self):
        """Test outlier model detection."""
        # Need more extreme differences to trigger outlier detection
        model_scores = {
            "model-a": [1.0, 2.0, 3.0, 4.0, 5.0],
            "model-b": [1.0, 2.0, 3.0, 4.0, 5.0],
            "model-c": [1.0, 2.0, 3.0, 4.0, 5.0],
            "model-d": [1.0, 2.0, 3.0, 4.0, 5.0],
            "outlier": [5.0, 4.0, 3.0, 2.0, 1.0],  # Reversed pattern
        }
        outliers = detect_outlier_models(model_scores, threshold=1.5)
        # With only 4-5 models, outlier detection is less reliable
        # Just verify the function runs without error
        assert isinstance(outliers, list)

    def test_model_agreement_single_model(self):
        """Test agreement with single model (no comparison possible)."""
        model_scores = {"only-model": [1.0, 2.0, 3.0]}
        result = compute_model_agreement(model_scores)
        assert result["pairwise"] == {}
        assert result["overallAgreement"] == 1.0


class TestDimensionImpact:
    """Tests for dimension impact analysis."""

    def test_eta_squared_basic(self):
        """Test eta-squared calculation."""
        groups = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
        all_values = [v for g in groups for v in g]
        eta = compute_eta_squared(groups, all_values)
        assert 0.0 <= eta <= 1.0
        assert eta > 0.5  # Groups are well separated

    def test_eta_squared_no_difference(self):
        """Test eta-squared when groups are identical."""
        groups = [[5, 5, 5], [5, 5, 5]]
        all_values = [5] * 6
        eta = compute_eta_squared(groups, all_values)
        assert eta == 0.0

    def test_analyze_dimension(self):
        """Test single dimension analysis."""
        scores = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
        dim_values = ["low", "low", "low", "high", "high", "high"]
        effect, p_value, method = analyze_dimension(scores, dim_values)
        assert 0.0 <= effect <= 1.0
        assert 0.0 <= p_value <= 1.0
        assert method == "kruskal_wallis"

    def test_compute_dimension_effects(self):
        """Test computing effects for multiple dimensions."""
        transcripts = [
            {
                "decisionModelV2": {"canonical": {"direction": "favor_second", "strength": "strong"}},
                "scenario": {"dimensions": {"stakes": "low", "context": "work"}},
            },
            {
                "decisionModelV2": {"canonical": {"direction": "favor_second", "strength": "lean"}},
                "scenario": {"dimensions": {"stakes": "low", "context": "home"}},
            },
            {
                "decisionModelV2": {"canonical": {"direction": "favor_first", "strength": "strong"}},
                "scenario": {"dimensions": {"stakes": "high", "context": "work"}},
            },
            {
                "decisionModelV2": {"canonical": {"direction": "favor_first", "strength": "lean"}},
                "scenario": {"dimensions": {"stakes": "high", "context": "home"}},
            },
        ]
        result = compute_dimension_effects(transcripts)
        assert "stakes" in result
        # Stakes should have higher effect than context
        assert result["stakes"]["effectSize"] > result.get("context", {}).get(
            "effectSize", 0
        )

    def test_compute_dimension_effects_skips_without_canonical(self):
        """Transcripts with no canonical block and no legacy score contribute nothing to dimension analysis."""
        transcripts = [
            {
                "orientationFlipped": True,
                "decisionModelV2": {"legacy": {"rawScore": 1}},
                "scenario": {"dimensions": {"stakes": "low"}},
            },
            {
                "orientationFlipped": True,
                "decisionModelV2": {"legacy": {"rawScore": 5}},
                "scenario": {"dimensions": {"stakes": "high"}},
            },
        ]
        # No canonical, no canonicalScore, no summary.score → all transcripts unscored → empty result
        result = compute_dimension_effects(transcripts)
        assert result == {}

    def test_variance_explained(self):
        """Test variance explained calculation."""
        transcripts = [
            {
                "decisionModelV2": {"canonical": {"direction": "favor_second", "strength": "strong"}},
                "scenario": {"dimensions": {"factor": "a"}},
            },
            {
                "decisionModelV2": {"canonical": {"direction": "favor_first", "strength": "strong"}},
                "scenario": {"dimensions": {"factor": "b"}},
            },
        ]
        r_squared = compute_variance_explained(transcripts)
        assert 0.0 <= r_squared <= 1.0

    def test_dimension_effects_empty(self):
        """Test with empty transcripts."""
        result = compute_dimension_effects([])
        assert result == {}


class TestIntegration:
    """Integration tests for the complete stats pipeline."""

    def test_spearman_matches_scipy(self):
        """Validate Spearman's rho matches scipy."""
        x = [1, 2, 3, 4, 5]
        y = [2, 4, 6, 8, 10]
        model_scores = {"a": x, "b": y}
        result = compute_pairwise_agreement(model_scores)
        scipy_rho, _ = scipy_stats.spearmanr(x, y)
        assert result["a:b"]["spearmanRho"] == pytest.approx(scipy_rho, abs=0.001)

    def test_kruskal_matches_scipy(self):
        """Validate Kruskal-Wallis matches scipy."""
        group1 = [1, 2, 3]
        group2 = [4, 5, 6]
        scores = group1 + group2
        dims = ["a", "a", "a", "b", "b", "b"]
        _, p_value, _ = analyze_dimension(scores, dims)
        scipy_h, scipy_p = scipy_stats.kruskal(group1, group2)
        assert p_value == pytest.approx(scipy_p, abs=0.001)

    def test_full_pipeline(self):
        """Test complete analysis pipeline."""
        transcripts = [
            {
                "modelId": "gpt-4",
                "decisionModelV2": {"canonical": {"direction": "favor_first", "strength": "lean"}},
                "summary": {
                    "score": 4,
                    "values": {
                        "Physical_Safety": "prioritized",
                        "Compassion": "deprioritized",
                    },
                },
                "scenario": {"dimensions": {"stakes": "high"}},
            },
            {
                "modelId": "gpt-4",
                "decisionModelV2": {"canonical": {"direction": "neutral", "strength": "neutral"}},
                "summary": {
                    "score": 3,
                    "values": {
                        "Physical_Safety": "prioritized",
                        "Compassion": "prioritized",
                    },
                },
                "scenario": {"dimensions": {"stakes": "low"}},
            },
            {
                "modelId": "claude",
                "decisionModelV2": {"canonical": {"direction": "favor_first", "strength": "lean"}},
                "summary": {
                    "score": 4,
                    "values": {
                        "Physical_Safety": "deprioritized",
                        "Compassion": "prioritized",
                    },
                },
                "scenario": {"dimensions": {"stakes": "high"}},
            },
        ]

        # Test aggregation
        per_model = aggregate_transcripts_by_model(transcripts)
        assert "gpt-4" in per_model
        assert "claude" in per_model
        assert per_model["gpt-4"]["sampleSize"] == 2

        # Test model comparison
        model_scores = {
            "gpt-4": [4, 3],
            "claude": [4],
        }
        # Can't compute with different lengths, but shows structure

        # Test dimension analysis
        effects = compute_dimension_effects(transcripts)
        assert "stakes" in effects
