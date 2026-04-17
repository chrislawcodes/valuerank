"""Per-vignette preference win rate computation."""

from typing import Any


def compute_two_step_by_value(
    outcomes_by_scenario_value: dict[str, dict[str, list[str]]],
    pooled_values: dict[str, Any],
) -> dict[str, Any]:
    """
    Compute per-vignette-averaged winRate for each value.

    For each value:
      1. For each unique vignette containing that value, compute
         vignette_rate = prioritized / total (all statuses for that vignette).
         Skip vignettes where total == 0 for this value.
      2. winRate = mean(vignette_rates).
         If no vignettes contribute (empty list), fall back to 0.5.

    Returns a dict in the same shape as model_stats["values"] but with
    winRate replaced by the two-step average. The count fields are
    preserved from pooled_values (raw response counts) for reference.
    """
    # Collect all value IDs seen across all vignettes
    all_value_ids: set[str] = set()
    for vignette_values in outcomes_by_scenario_value.values():
        all_value_ids.update(vignette_values.keys())

    result: dict[str, Any] = {}
    for value_id in all_value_ids:
        vignette_rates: list[float] = []
        for vignette_outcomes in outcomes_by_scenario_value.values():
            statuses = vignette_outcomes.get(value_id, [])
            if not statuses:
                continue
            p = sum(1 for s in statuses if s == "prioritized")
            total = len(statuses)
            if total == 0:
                continue  # guard, should not occur
            vignette_rates.append(p / total)

        two_step_win_rate = (
            sum(vignette_rates) / len(vignette_rates)
            if vignette_rates
            else 0.5
        )

        # Preserve raw count fields from pooled stats if available
        pooled_entry = pooled_values.get(value_id, {})
        entry: dict[str, Any] = {
            "winRate": round(two_step_win_rate, 6),
        }
        if "count" in pooled_entry:
            entry["count"] = pooled_entry["count"]

        result[value_id] = entry

    # Include any values in pooled_values not seen in vignette outcomes
    # (edge case: transcripts have no summary.values data)
    for value_id, pooled_entry in pooled_values.items():
        if value_id not in result:
            entry = dict(pooled_entry)
            entry["winRate"] = 0.5
            result[value_id] = entry

    return result
