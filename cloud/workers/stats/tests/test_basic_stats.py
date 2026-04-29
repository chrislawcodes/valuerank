"""Unit tests for basic_stats.compute_win_rate, compute_value_stats, and aggregation."""

import pytest

from stats.basic_stats import aggregate_transcripts_by_model, compute_value_stats, compute_win_rate


def make_transcript(
    model_id: str,
    scenario_id: str | None,
    value_status: str | None = None,
    *,
    direction: str | None = None,
    strength: str | None = None,
    value_key: str = "Value_A",
) -> dict[str, object]:
    transcript: dict[str, object] = {
        "id": f"{model_id}-{scenario_id or 'unknown'}-{value_status or 'unscored'}-{direction or 'no-direction'}-{strength or 'no-strength'}",
        "modelId": model_id,
        "summary": {
            "values": {} if value_status is None else {value_key: value_status},
        },
    }
    if scenario_id is not None:
        transcript["scenarioId"] = scenario_id
    if direction is not None and strength is not None:
        transcript["decisionModelV2"] = {
            "canonical": {
                "direction": direction,
                "strength": strength,
            },
        }
    return transcript


class TestComputeWinRate:
    def test_zero_neutral_matches_old_behavior(self):
        """3 prioritized, 1 deprioritized, 0 neutral = 0.75."""
        assert compute_win_rate(3, 1, 0) == pytest.approx(0.75)

    def test_heavy_neutral_drags_rate_down(self):
        """1 prioritized, 0 deprioritized, 9 neutral = 0.1 (headline case)."""
        assert compute_win_rate(1, 0, 9) == pytest.approx(0.1)

    def test_all_neutral_is_honest_zero(self):
        """0 prioritized, 0 deprioritized, 100 neutral = 0.0."""
        assert compute_win_rate(0, 0, 100) == pytest.approx(0.0)

    def test_no_data_fallback(self):
        """0 prioritized, 0 deprioritized, 0 neutral = 0.5 (no-data fallback)."""
        assert compute_win_rate(0, 0, 0) == pytest.approx(0.5)

    def test_symmetric_no_neutrals(self):
        """5 prioritized, 5 deprioritized, 0 neutral = 0.5."""
        assert compute_win_rate(5, 5, 0) == pytest.approx(0.5)

    def test_symmetric_with_neutrals(self):
        """5 prioritized, 5 deprioritized, 10 neutral = 0.25."""
        assert compute_win_rate(5, 5, 10) == pytest.approx(0.25)

    def test_default_neutral_is_zero(self):
        """Calling without a neutral arg defaults to 0 (backwards compat)."""
        assert compute_win_rate(3, 1) == pytest.approx(0.75)


class TestComputeValueStats:
    def test_includes_neutral_in_win_rate(self):
        stats = compute_value_stats(prioritized=1, deprioritized=0, neutral=9)
        assert stats["winRate"] == pytest.approx(0.1)
        assert stats["count"]["prioritized"] == pytest.approx(1.0)
        assert stats["count"]["deprioritized"] == pytest.approx(0.0)
        assert stats["count"]["neutral"] == pytest.approx(9.0)

    def test_accepts_fractional_counts_and_rounds_output(self):
        stats = compute_value_stats(prioritized=1.25, deprioritized=2.5, neutral=0.25)
        assert stats["winRate"] == pytest.approx(0.3125, abs=1e-6)
        assert stats["count"]["prioritized"] == pytest.approx(1.25)
        assert stats["count"]["deprioritized"] == pytest.approx(2.5)
        assert stats["count"]["neutral"] == pytest.approx(0.25)

    def test_no_data_returns_half(self):
        stats = compute_value_stats(prioritized=0, deprioritized=0, neutral=0)
        assert stats["winRate"] == pytest.approx(0.5)


class TestAggregateTranscriptsByModel:
    def test_worked_example_uses_condition_weighting(self):
        transcripts: list[dict[str, object]] = []

        for index in range(10):
            transcripts.append(make_transcript('m1', f'full-{index}', 'prioritized'))

        for index in range(15):
            scenario_id = f'mixed-{index}'
            for trial_index in range(5):
                status = 'prioritized' if trial_index < 3 else 'deprioritized'
                transcripts.append(make_transcript('m1', scenario_id, status))

        result = aggregate_transcripts_by_model(transcripts)
        stats = result['m1']['values']['Value_A']

        assert result['m1']['sampleSize'] == 85
        assert result['m1']['conditionCount'] == 25
        assert stats['winRate'] == pytest.approx(0.76, abs=1e-6)
        assert stats['count']['prioritized'] == pytest.approx(19.0, abs=1e-6)
        assert stats['count']['deprioritized'] == pytest.approx(6.0, abs=1e-6)
        assert stats['count']['neutral'] == pytest.approx(0.0, abs=1e-6)
        assert abs(
            stats['count']['prioritized'] + stats['count']['deprioritized'] + stats['count']['neutral'] - result['m1']['conditionCount']
        ) < 1e-6

    def test_single_condition_std_dev_is_zero(self):
        transcripts = [
            make_transcript('m1', 's1', 'prioritized', direction='favor_first', strength='lean'),
            make_transcript('m1', 's1', 'prioritized', direction='favor_first', strength='strong'),
            make_transcript('m1', 's1', 'prioritized'),
        ]

        result = aggregate_transcripts_by_model(transcripts)
        overall = result['m1']['overall']

        assert result['m1']['conditionCount'] == 1
        assert overall['mean'] == pytest.approx(1.5, abs=1e-6)
        assert overall['stdDev'] == 0.0
        assert overall['min'] == pytest.approx(1.5, abs=1e-6)
        assert overall['max'] == pytest.approx(1.5, abs=1e-6)

    def test_partial_score_condition_ignores_unscored_trials_and_skips_zero_scored_conditions(self):
        transcripts = [
            make_transcript('m1', 'scored', None, direction='favor_first', strength='lean'),
            make_transcript('m1', 'scored', None, direction='favor_first', strength='strong'),
            make_transcript('m1', 'scored', None),
            make_transcript('m1', 'silent', None),
            make_transcript('m1', 'silent', None),
        ]

        result = aggregate_transcripts_by_model(transcripts)
        overall = result['m1']['overall']

        assert result['m1']['conditionCount'] == 2
        assert result['m1']['sampleSize'] == 5
        assert overall['mean'] == pytest.approx(1.5, abs=1e-6)
        assert overall['stdDev'] == 0.0
        assert overall['min'] == pytest.approx(1.5, abs=1e-6)
        assert overall['max'] == pytest.approx(1.5, abs=1e-6)

    def test_empty_input_returns_empty_result(self):
        assert aggregate_transcripts_by_model([]) == {}

    def test_missing_scenario_id_uses_unknown_condition(self):
        transcripts = [
            make_transcript('m1', None, 'prioritized'),
            make_transcript('m1', None, 'deprioritized'),
        ]

        result = aggregate_transcripts_by_model(transcripts)
        stats = result['m1']['values']['Value_A']

        assert result['m1']['sampleSize'] == 2
        assert result['m1']['conditionCount'] == 1
        assert stats['winRate'] == pytest.approx(0.5, abs=1e-6)
        assert stats['count']['prioritized'] == pytest.approx(0.5, abs=1e-6)
        assert stats['count']['deprioritized'] == pytest.approx(0.5, abs=1e-6)
        assert stats['count']['neutral'] == pytest.approx(0.0, abs=1e-6)

    def test_fractional_counts_are_rounded_to_six_decimals(self):
        transcripts = [
            make_transcript('m1', 's1', 'prioritized'),
            make_transcript('m1', 's1', 'deprioritized'),
            make_transcript('m1', 's1', 'deprioritized'),
        ]

        result = aggregate_transcripts_by_model(transcripts)
        stats = result['m1']['values']['Value_A']

        assert stats['count']['prioritized'] == pytest.approx(0.333333, abs=1e-6)
        assert stats['count']['deprioritized'] == pytest.approx(0.666667, abs=1e-6)
        assert stats['count']['neutral'] == pytest.approx(0.0, abs=1e-6)
        assert stats['winRate'] == pytest.approx(0.333333, abs=1e-6)
