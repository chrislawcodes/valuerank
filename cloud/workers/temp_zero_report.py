#!/usr/bin/env python3
import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence


JSON_OUTPUT = "temp_zero_report.json"


@dataclass
class MetricResult:
    pct: Optional[float]
    matched: int
    total: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a temp-zero verification report from ValueRank transcripts."
    )
    parser.add_argument(
        "--days",
        type=int,
        default=30,
        help="Look back this many days for temp=0 runs (default: 30).",
    )
    return parser.parse_args()


def get_connection() -> Any:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("Error: DATABASE_URL is not set.", file=sys.stderr)
        raise SystemExit(1)
    try:
        import psycopg2
    except ImportError as exc:
        print(f"Error: psycopg2 is not installed: {exc}", file=sys.stderr)
        raise SystemExit(1)
    return psycopg2.connect(db_url)


def get_table_columns(conn: Any, table_name: str) -> set[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = %s
              AND table_schema = ANY(current_schemas(false))
            """,
            (table_name,),
        )
        return {row[0] for row in cur.fetchall()}


def fetch_recent_runs(conn: Any, days: int) -> List[Dict[str, Any]]:
    columns = get_table_columns(conn, "runs")
    required = {"id", "config"}
    if not required.issubset(columns):
        missing = ", ".join(sorted(required - columns))
        print(
            f"Warning: runs table is missing required column(s): {missing}. "
            "Cannot identify temp=0 runs."
        )
        return []

    select_created = "created_at" if "created_at" in columns else "NULL::timestamptz AS created_at"
    where_parts = ["(config->>'temperature')::float = 0"]
    params: List[Any] = []

    if "created_at" in columns:
        where_parts.append("created_at > NOW() - (%s * INTERVAL '1 day')")
        params.append(days)
    else:
        print("Warning: runs.created_at is missing; lookback filter is skipped.")

    if "deleted_at" in columns:
        where_parts.append("deleted_at IS NULL")

    order_by = "ORDER BY created_at DESC" if "created_at" in columns else ""
    model_select = "model_id" if "model_id" in columns else "NULL::text AS model_id"
    query = f"""
        SELECT id, {model_select}, {select_created}
        FROM runs
        WHERE {' AND '.join(where_parts)}
        {order_by}
        LIMIT 200
    """

    import psycopg2.extras

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query, params)
        return list(cur.fetchall())


def fetch_transcripts(conn: Any, run_ids: Sequence[Any]) -> List[Dict[str, Any]]:
    if not run_ids:
        return []

    columns = get_table_columns(conn, "transcripts")
    if "run_id" not in columns:
        print("Warning: transcripts.run_id is missing; cannot load transcripts.")
        return []

    select_parts = [
        "t.id" if "id" in columns else "NULL::bigint AS id",
        "t.model_id" if "model_id" in columns else "NULL::text AS model_id",
        "t.scenario_id" if "scenario_id" in columns else "NULL::text AS scenario_id",
        "t.decision_code" if "decision_code" in columns else "NULL::text AS decision_code",
    ]

    if "content" in columns:
        select_parts.extend(
            [
                "t.content->'turns'->0->'providerMetadata'->>'promptHash' AS prompt_hash",
                "t.content->'turns'->0->'providerMetadata'->>'adapterMode' AS adapter_mode",
                (
                    "t.content->'turns'->0->'providerMetadata'->'raw'->>'system_fingerprint' "
                    "AS system_fingerprint"
                ),
            ]
        )
    else:
        print("Warning: transcripts.content is missing; metadata checks will be unavailable.")
        select_parts.extend(
            [
                "NULL::text AS prompt_hash",
                "NULL::text AS adapter_mode",
                "NULL::text AS system_fingerprint",
            ]
        )

    select_parts.append(
        "t.created_at" if "created_at" in columns else "NULL::timestamptz AS created_at"
    )

    where_parts = ["t.run_id = ANY(%s)"]
    if "deleted_at" in columns:
        where_parts.append("t.deleted_at IS NULL")

    order_parts = []
    if "model_id" in columns:
        order_parts.append("t.model_id")
    if "scenario_id" in columns:
        order_parts.append("t.scenario_id")
    if "created_at" in columns:
        order_parts.append("t.created_at DESC")

    order_by = f"ORDER BY {', '.join(order_parts)}" if order_parts else ""
    query = f"""
        SELECT {', '.join(select_parts)}
        FROM transcripts t
        WHERE {' AND '.join(where_parts)}
        {order_by}
    """

    import psycopg2.extras

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query, (list(run_ids),))
        return list(cur.fetchall())


def normalize_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def stable_metric_for_groups(
    groups: Dict[Any, List[Dict[str, Any]]], key: str, min_items: int = 2
) -> MetricResult:
    matched = 0
    total = 0

    for items in groups.values():
        values = [normalize_text(item.get(key)) for item in items]
        values = [value for value in values if value is not None]
        if len(values) < min_items:
            continue
        total += 1
        if len(set(values)) == 1:
            matched += 1

    pct = None if total == 0 else (matched / total) * 100.0
    return MetricResult(pct=pct, matched=matched, total=total)


def drift_metric_for_groups(
    groups: Dict[Any, List[Dict[str, Any]]], key: str
) -> MetricResult:
    stable = stable_metric_for_groups(groups, key, min_items=2)
    if stable.pct is None:
        return MetricResult(pct=None, matched=0, total=0)
    drifted = stable.total - stable.matched
    return MetricResult(
        pct=(drifted / stable.total) * 100.0,
        matched=drifted,
        total=stable.total,
    )


def decision_match_metric(groups: Dict[Any, List[Dict[str, Any]]]) -> MetricResult:
    matched = 0
    total = 0

    for items in groups.values():
        sorted_items = sorted(
            items,
            key=lambda item: (
                item.get("created_at") is None,
                item.get("created_at") or datetime.min.replace(tzinfo=timezone.utc),
            ),
            reverse=True,
        )
        recent = sorted_items[:3]
        decisions = [normalize_text(item.get("decision_code")) for item in recent]
        if len(decisions) < 3 or any(decision is None for decision in decisions):
            continue
        total += 1
        if len(set(decisions)) == 1:
            matched += 1

    pct = None if total == 0 else (matched / total) * 100.0
    return MetricResult(pct=pct, matched=matched, total=total)


def format_metric(metric: MetricResult) -> str:
    if metric.pct is None:
        return "N/A (no data)"
    return f"{round(metric.pct):.0f}% ({metric.matched}/{metric.total})"


def format_fingerprint_stability(metric: MetricResult) -> str:
    if metric.pct is None:
        return "N/A (no data)"
    stable = metric.total - metric.matched
    stable_pct = 100.0 - metric.pct
    return f"{round(stable_pct):.0f}% ({stable}/{metric.total})"


def analyze_transcripts(transcripts: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_model: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in transcripts:
        model_id = normalize_text(row.get("model_id")) or "unknown-model"
        by_model[model_id].append(dict(row))

    results: List[Dict[str, Any]] = []
    for model_id in sorted(by_model):
        model_rows = by_model[model_id]
        adapter_counts: Counter[str] = Counter()
        groups: Dict[Any, List[Dict[str, Any]]] = defaultdict(list)

        for row in model_rows:
            adapter_value = normalize_text(row.get("adapter_mode")) or "unknown"
            adapter_counts[adapter_value] += 1
            scenario_key = normalize_text(row.get("scenario_id")) or "__unknown_scenario__"
            groups[scenario_key].append(row)

        prompt_metric = stable_metric_for_groups(groups, "prompt_hash", min_items=2)
        fingerprint_drift = drift_metric_for_groups(groups, "system_fingerprint")
        decision_metric = decision_match_metric(groups)
        temp_handling = adapter_counts.most_common(1)[0][0] if adapter_counts else "unknown"

        results.append(
            {
                "model_id": model_id,
                "transcript_count": len(model_rows),
                "temp_handling": temp_handling,
                "adapter_mode_distribution": dict(sorted(adapter_counts.items())),
                "prompt_hash_stability_pct": prompt_metric.pct,
                "prompt_hash_stable_groups": prompt_metric.matched,
                "prompt_hash_total_groups": prompt_metric.total,
                "fingerprint_drift_pct": fingerprint_drift.pct,
                "fingerprint_drift_groups": fingerprint_drift.matched,
                "fingerprint_total_groups": fingerprint_drift.total,
                "decision_match_rate_pct": decision_metric.pct,
                "decision_match_groups": decision_metric.matched,
                "decision_total_groups": decision_metric.total,
            }
        )

    return results


def print_report(generated_at: str, transcript_count: int, models: List[Dict[str, Any]]) -> None:
    headers = [
        "Model",
        "Temp Handling",
        "Prompt Hash Stable",
        "Fingerprint Stable",
        "Decision Match",
    ]

    rows = []
    for model in models:
        prompt_metric = MetricResult(
            pct=model["prompt_hash_stability_pct"],
            matched=model["prompt_hash_stable_groups"],
            total=model["prompt_hash_total_groups"],
        )
        fingerprint_metric = MetricResult(
            pct=model["fingerprint_drift_pct"],
            matched=model["fingerprint_drift_groups"],
            total=model["fingerprint_total_groups"],
        )
        decision_metric = MetricResult(
            pct=model["decision_match_rate_pct"],
            matched=model["decision_match_groups"],
            total=model["decision_total_groups"],
        )
        rows.append(
            [
                model["model_id"],
                model["temp_handling"],
                format_metric(prompt_metric),
                format_fingerprint_stability(fingerprint_metric),
                format_metric(decision_metric),
            ]
        )

    widths = [len(header) for header in headers]
    for row in rows:
        for idx, cell in enumerate(row):
            widths[idx] = max(widths[idx], len(cell))

    def render_row(values: Sequence[str]) -> str:
        return " | ".join(value.ljust(widths[idx]) for idx, value in enumerate(values))

    separator = "-+-".join("-" * width for width in widths)

    print("=== Temp-Zero Verification Report ===")
    print(f"Generated: {generated_at}")
    print(f"Transcripts analyzed: {transcript_count}")
    print()
    print(render_row(headers))
    print(separator)
    for row in rows:
        print(render_row(row))


def write_json_report(
    generated_at: str, transcript_count: int, models: List[Dict[str, Any]]
) -> str:
    payload = {
        "generated_at": generated_at,
        "transcript_count": transcript_count,
        "models": [
            {
                "model_id": model["model_id"],
                "transcript_count": model["transcript_count"],
                "temp_handling": model["temp_handling"],
                "adapter_mode_distribution": model["adapter_mode_distribution"],
                "prompt_hash_stability_pct": model["prompt_hash_stability_pct"],
                "fingerprint_drift_pct": model["fingerprint_drift_pct"],
                "decision_match_rate_pct": model["decision_match_rate_pct"],
            }
            for model in models
        ],
    }

    output_path = os.path.join(os.getcwd(), JSON_OUTPUT)
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=False)
        handle.write("\n")
    return output_path


def main() -> None:
    args = parse_args()
    generated_at = datetime.now(timezone.utc).isoformat()

    try:
        conn = get_connection()
    except SystemExit:
        raise

    with conn:
        runs = fetch_recent_runs(conn, args.days)
        if not runs:
            print("No recent temp=0 runs found.")
            raise SystemExit(0)

        run_ids = [row["id"] for row in runs if row.get("id") is not None]
        transcripts = fetch_transcripts(conn, run_ids)

    models = analyze_transcripts(transcripts)
    print_report(generated_at, len(transcripts), models)
    output_path = write_json_report(generated_at, len(transcripts), models)
    print()
    print(f"JSON report written to {output_path}")


if __name__ == "__main__":
    main()
