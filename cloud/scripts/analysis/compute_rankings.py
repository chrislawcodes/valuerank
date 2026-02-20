#!/usr/bin/env python3
"""
Compute cross-model value rankings from raw-data.csv.

Outputs:
    - win-rate-rankings.csv      Per-model per-value aggregated win rates
    - model-comparison-matrix.csv Pivot table: models x values x win rates
    - bradley-terry-rankings.csv  BT strength scores per model per value
    - pairwise-divergence.csv     Kendall tau rank correlations between model pairs

Usage:
    python scripts/analysis/compute_rankings.py

Requires:
    pip install numpy scipy pandas choix
"""
import csv
import math
import sys
from collections import defaultdict
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import kendalltau

try:
    import choix
except ImportError:
    print("Install choix: pip install choix", file=sys.stderr)
    sys.exit(1)

INPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR = INPUT_DIR  # same directory


def wilson_score_interval(successes: int, trials: int, z: float = 1.96) -> tuple:
    """Wilson score confidence interval for a proportion."""
    if trials == 0:
        return (0.0, 0.0)
    p = successes / trials
    denom = 1 + z * z / trials
    center = (p + z * z / (2 * trials)) / denom
    spread = z * math.sqrt((p * (1 - p) + z * z / (4 * trials)) / trials) / denom
    return (max(0.0, center - spread), min(1.0, center + spread))


def load_raw_data() -> pd.DataFrame:
    """Load raw-data.csv into a DataFrame."""
    path = INPUT_DIR / "raw-data.csv"
    if not path.exists():
        print(f"ERROR: {path} not found. Run extract_cross_model_data.py first.", file=sys.stderr)
        sys.exit(1)
    df = pd.read_csv(path)
    print(f"Loaded {len(df)} rows from {path}")
    return df


def compute_win_rates(df: pd.DataFrame) -> pd.DataFrame:
    """Aggregate win rates per model per value across all vignettes.

    For each model, for each of the 10 values:
      - Count how many times it was prioritized (as value_a or value_b)
      - Count how many times it was deprioritized
      - global_win_rate = prioritized / (prioritized + deprioritized)

    IMPORTANT: Sum counts, don't average rates.
    """
    # Build per-model per-value counts
    counts = defaultdict(lambda: {"prioritized": 0, "deprioritized": 0, "neutral": 0})

    for _, row in df.iterrows():
        model = row["model_id"]
        va, vb = row["value_a"], row["value_b"]
        va_out, vb_out = row["value_a_outcome"], row["value_b_outcome"]

        for value, outcome in [(va, va_out), (vb, vb_out)]:
            key = (model, value)
            counts[key][outcome] += 1

    # Convert to rows
    rows = []
    for (model, value), c in sorted(counts.items()):
        pri = c["prioritized"]
        dep = c["deprioritized"]
        neu = c["neutral"]
        total_decisive = pri + dep
        win_rate = pri / total_decisive if total_decisive > 0 else 0.5
        ci_lower, ci_upper = wilson_score_interval(pri, total_decisive)

        rows.append({
            "model_id": model,
            "value_name": value,
            "global_win_rate": round(win_rate, 4),
            "total_prioritized": pri,
            "total_deprioritized": dep,
            "total_neutral": neu,
            "total_decisive": total_decisive,
            "wilson_ci_lower": round(ci_lower, 4),
            "wilson_ci_upper": round(ci_upper, 4),
        })

    result = pd.DataFrame(rows)

    # Add rank within each model (1 = highest win rate)
    result["rank_within_model"] = result.groupby("model_id")["global_win_rate"].rank(
        ascending=False, method="min"
    ).astype(int)

    return result


def build_comparison_matrix(win_rates: pd.DataFrame) -> pd.DataFrame:
    """Pivot table: models as rows, values as columns, win rates as cells."""
    pivot = win_rates.pivot(index="model_id", columns="value_name", values="global_win_rate")
    # Sort columns alphabetically
    pivot = pivot[sorted(pivot.columns)]
    return pivot


def compute_bradley_terry(df: pd.DataFrame) -> pd.DataFrame:
    """Fit Bradley-Terry models per model using raw pairwise outcomes.

    Each transcript where value_a is prioritized counts as a "win" for value_a
    over value_b. Each transcript where value_b is prioritized counts as a "win"
    for value_b over value_a. Neutral outcomes are excluded.
    """
    # Get all unique values
    all_values = sorted(set(df["value_a"].unique()) | set(df["value_b"].unique()))
    n_values = len(all_values)
    value_idx = {name: i for i, name in enumerate(all_values)}

    models = sorted(df["model_id"].unique())
    n_bootstrap = 1000

    results = []

    for model in models:
        model_df = df[df["model_id"] == model]

        # Build matchup list: (winner_idx, loser_idx) pairs
        matchups = []
        for _, row in model_df.iterrows():
            va_idx = value_idx[row["value_a"]]
            vb_idx = value_idx[row["value_b"]]

            if row["value_a_outcome"] == "prioritized":
                matchups.append((va_idx, vb_idx))
            elif row["value_b_outcome"] == "prioritized":
                matchups.append((vb_idx, va_idx))
            # neutral: skip

        if len(matchups) < 10:
            print(f"  WARNING: {model} has only {len(matchups)} matchups, skipping BT")
            continue

        matchups_arr = np.array(matchups)

        # Fit BT model
        try:
            params = choix.ilsr_pairwise(n_values, matchups_arr)
        except Exception as e:
            print(f"  WARNING: BT fit failed for {model}: {e}")
            continue

        # Normalize: center at 0, exponentiate for strengths
        params = params - params.mean()
        strengths = np.exp(params)

        # Bootstrap CIs (resample at vignette level to respect clustering)
        boot_strengths = np.zeros((n_bootstrap, n_values))
        vignette_groups = model_df.groupby("vignette_id")
        vignette_keys = list(vignette_groups.groups.keys())

        for b in range(n_bootstrap):
            # Resample vignettes with replacement
            boot_vignettes = np.random.choice(vignette_keys, size=len(vignette_keys), replace=True)
            boot_matchups = []
            for vig_id in boot_vignettes:
                vig_df = vignette_groups.get_group(vig_id)
                for _, row in vig_df.iterrows():
                    va_idx = value_idx[row["value_a"]]
                    vb_idx = value_idx[row["value_b"]]
                    if row["value_a_outcome"] == "prioritized":
                        boot_matchups.append((va_idx, vb_idx))
                    elif row["value_b_outcome"] == "prioritized":
                        boot_matchups.append((vb_idx, va_idx))

            if len(boot_matchups) < 10:
                boot_strengths[b] = strengths  # fallback
                continue

            try:
                boot_params = choix.ilsr_pairwise(n_values, np.array(boot_matchups))
                boot_params = boot_params - boot_params.mean()
                boot_strengths[b] = np.exp(boot_params)
            except Exception:
                boot_strengths[b] = strengths

        ci_lower = np.percentile(boot_strengths, 2.5, axis=0)
        ci_upper = np.percentile(boot_strengths, 97.5, axis=0)

        # Probability of beating an "average" value
        total_strength = strengths.sum()
        avg_strength = total_strength / n_values
        prob_vs_avg = strengths / (strengths + avg_strength)

        for i, value_name in enumerate(all_values):
            results.append({
                "model_id": model,
                "value_name": value_name,
                "bt_strength": round(strengths[i], 4),
                "bt_log_strength": round(params[i], 4),
                "bt_ci_lower": round(ci_lower[i], 4),
                "bt_ci_upper": round(ci_upper[i], 4),
                "bt_prob_vs_avg": round(prob_vs_avg[i], 4),
            })

    result = pd.DataFrame(results)
    if len(result) > 0:
        result["bt_rank"] = result.groupby("model_id")["bt_strength"].rank(
            ascending=False, method="min"
        ).astype(int)

    return result


def compute_divergence(win_rates: pd.DataFrame) -> pd.DataFrame:
    """Compute pairwise rank divergence between all model pairs."""
    models = sorted(win_rates["model_id"].unique())
    all_values = sorted(win_rates["value_name"].unique())

    # Build rank lookup: model -> {value: rank}
    rank_lookup = {}
    for model in models:
        model_data = win_rates[win_rates["model_id"] == model].set_index("value_name")
        rank_lookup[model] = {v: model_data.loc[v, "rank_within_model"] for v in all_values if v in model_data.index}

    rows = []
    for model_a, model_b in combinations(models, 2):
        ranks_a = [rank_lookup[model_a].get(v, 0) for v in all_values]
        ranks_b = [rank_lookup[model_b].get(v, 0) for v in all_values]

        tau, p_value = kendalltau(ranks_a, ranks_b)

        # Top diverging values by rank difference
        rank_diffs = [(abs(ra - rb), v, ra, rb) for v, ra, rb in zip(all_values, ranks_a, ranks_b)]
        rank_diffs.sort(reverse=True)

        row = {
            "model_a": model_a,
            "model_b": model_b,
            "kendall_tau": round(tau, 4),
            "tau_p_value": round(p_value, 6),
        }

        for k in range(min(3, len(rank_diffs))):
            diff, val, ra, rb = rank_diffs[k]
            row[f"diverging_value_{k+1}"] = val
            row[f"rank_diff_{k+1}"] = int(diff)
            row[f"rank_a_{k+1}"] = int(ra)
            row[f"rank_b_{k+1}"] = int(rb)

        rows.append(row)

    return pd.DataFrame(rows)


def main():
    print("Cross-Model Value Analysis - Compute Rankings")
    print("=" * 50)

    df = load_raw_data()

    # Phase 3: Win-rate rankings
    print("\n--- Phase 3: Win-Rate Rankings ---")
    win_rates = compute_win_rates(df)
    win_rates.to_csv(OUTPUT_DIR / "win-rate-rankings.csv", index=False)
    print(f"Wrote {len(win_rates)} rows to win-rate-rankings.csv")

    matrix = build_comparison_matrix(win_rates)
    matrix.to_csv(OUTPUT_DIR / "model-comparison-matrix.csv")
    print(f"Wrote model-comparison-matrix.csv ({matrix.shape[0]} models x {matrix.shape[1]} values)")

    # Phase 4: Bradley-Terry
    print("\n--- Phase 4: Bradley-Terry Rankings ---")
    bt = compute_bradley_terry(df)
    if len(bt) > 0:
        bt.to_csv(OUTPUT_DIR / "bradley-terry-rankings.csv", index=False)
        print(f"Wrote {len(bt)} rows to bradley-terry-rankings.csv")
    else:
        print("WARNING: No Bradley-Terry results produced")

    # Phase 5: Divergence
    print("\n--- Phase 5: Pairwise Divergence ---")
    div = compute_divergence(win_rates)
    div.to_csv(OUTPUT_DIR / "pairwise-divergence.csv", index=False)
    print(f"Wrote {len(div)} rows to pairwise-divergence.csv")

    # Print top-level summary
    print(f"\n{'=' * 50}")
    print("SUMMARY")
    print(f"{'=' * 50}")

    print("\nTop values by average win rate across all models:")
    avg_wr = win_rates.groupby("value_name")["global_win_rate"].mean().sort_values(ascending=False)
    for val, wr in avg_wr.items():
        print(f"  {val:40s} {wr:.3f}")

    if len(bt) > 0:
        print("\nTop values by average BT strength across all models:")
        avg_bt = bt.groupby("value_name")["bt_strength"].mean().sort_values(ascending=False)
        for val, s in avg_bt.items():
            print(f"  {val:40s} {s:.3f}")

    print("\nMost divergent model pairs (lowest Kendall tau):")
    most_div = div.nsmallest(5, "kendall_tau")
    for _, row in most_div.iterrows():
        print(f"  {row['model_a']:30s} vs {row['model_b']:30s}  tau={row['kendall_tau']:.3f}")

    print("\nMost aligned model pairs (highest Kendall tau):")
    most_aligned = div.nlargest(5, "kendall_tau")
    for _, row in most_aligned.iterrows():
        print(f"  {row['model_a']:30s} vs {row['model_b']:30s}  tau={row['kendall_tau']:.3f}")


if __name__ == "__main__":
    main()
