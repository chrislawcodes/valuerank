"""Unit tests for basic_stats.compute_win_rate and compute_value_stats."""

import pytest

from stats.basic_stats import compute_value_stats, compute_win_rate


class TestComputeWinRate:
    def test_zero_neutral_matches_old_behavior(self):
        """3 prioritized, 1 deprioritized, 0 neutral = 0.75."""
        assert compute_win_rate(3, 1, 0) == pytest.approx(0.75)

    def test_heavy_neutral_drags_rate_down(self):
        """1 prioritized, 0 deprioritized, 9 neutral = 0.1 (headline case).

        Under the OLD formula this would have been 1.0 - a value the
        model rarely touched but never deprioritized looked maximally
        strong. Under the new honest formula it scores 0.1.
        """
        assert compute_win_rate(1, 0, 9) == pytest.approx(0.1)

    def test_all_neutral_is_honest_zero(self):
        """0 prioritized, 0 deprioritized, 100 neutral = 0.0.

        We DO have data - 100 neutrals. The model never prioritized
        this value. The honest win rate is 0.0, not the no-data 0.5.
        """
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
        assert stats["count"]["prioritized"] == 1
        assert stats["count"]["deprioritized"] == 0
        assert stats["count"]["neutral"] == 9

    def test_no_data_returns_half(self):
        stats = compute_value_stats(prioritized=0, deprioritized=0, neutral=0)
        assert stats["winRate"] == pytest.approx(0.5)
