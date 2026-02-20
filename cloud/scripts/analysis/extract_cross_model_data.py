#!/usr/bin/env python3
"""
Extract cross-model value analysis data from ValueRank GraphQL API.
Outputs raw-data.csv with per-model per-transcript decision codes for all job-domain vignettes.

Usage:
    VALUERANK_API_KEY=vr_... python scripts/analysis/extract_cross_model_data.py

    Or for local dev:
    VALUERANK_API_URL=http://localhost:3031/graphql python scripts/analysis/extract_cross_model_data.py

Requires:
    pip install requests
"""
import requests
import json
import csv
import os
import sys
import subprocess
from pathlib import Path

API_URL = os.getenv("VALUERANK_API_URL", "https://api.valuerank.org/graphql")
API_KEY = os.getenv("VALUERANK_API_KEY", "")
OUTPUT_DIR = Path(__file__).parent / "output"
CLOUD_DIR = Path(__file__).parent.parent.parent  # cloud/
MAPPING_FILE = Path(__file__).parent / "run-mapping.json"


def get_auth_headers() -> dict:
    """Get authentication headers for the API."""
    if API_KEY:
        return {"X-API-Key": API_KEY}

    # Fallback: generate JWT for local dev
    token = os.getenv("VALUERANK_TOKEN")
    if not token:
        result = subprocess.run(
            [
                "node", "-e",
                "const jwt=require('jsonwebtoken');"
                "console.log(jwt.sign("
                "{sub:'cmixy5vz90000l8tv2t6ar0vc',email:'dev@valuerank.ai'},"
                "'dev-secret-key-for-local-development-only-32chars',"
                "{expiresIn:'1h'}))"
            ],
            capture_output=True, text=True, cwd=str(CLOUD_DIR)
        )
        if result.returncode != 0:
            print(f"Failed to generate JWT: {result.stderr}", file=sys.stderr)
            sys.exit(1)
        token = result.stdout.strip()

    return {"Authorization": f"Bearer {token}"}


def graphql(query: str, variables: dict | None = None) -> dict:
    """Execute a GraphQL query against the ValueRank API."""
    headers = {
        "Content-Type": "application/json",
        **get_auth_headers(),
    }
    resp = requests.post(
        API_URL,
        json={"query": query, "variables": variables or {}},
        headers=headers,
    )
    resp.raise_for_status()
    data = resp.json()
    if "errors" in data:
        raise RuntimeError(f"GraphQL errors: {json.dumps(data['errors'], indent=2)}")
    return data["data"]


def get_definition(def_id: str) -> dict:
    """Get a single definition by ID."""
    data = graphql("""
        query($id: ID!) {
            definition(id: $id) {
                id name content
            }
        }
    """, {"id": def_id})
    return data["definition"]


def get_transcripts_for_run(run_id: str) -> list:
    """Get all transcripts for a run with decision codes (paginated)."""
    import time
    all_transcripts = []
    offset = 0
    batch_size = 500

    while True:
        for attempt in range(3):
            try:
                data = graphql("""
                    query($runId: ID!, $limit: Int!, $offset: Int!) {
                        run(id: $runId) {
                            transcripts(limit: $limit, offset: $offset) {
                                id modelId scenarioId decisionCode sampleIndex
                                scenario { content }
                            }
                        }
                    }
                """, {"runId": run_id, "limit": batch_size, "offset": offset})

                if data.get("run") is None:
                    if attempt < 2:
                        print(f"    Run returned null, retrying ({attempt+1}/3)...")
                        time.sleep(2)
                        continue
                    print(f"    WARNING: Run {run_id} returned null after 3 attempts")
                    return all_transcripts

                transcripts = data["run"]["transcripts"]
                break
            except Exception as e:
                if attempt < 2:
                    print(f"    Error: {e}, retrying ({attempt+1}/3)...")
                    time.sleep(2)
                else:
                    raise
        else:
            return all_transcripts

        if not transcripts:
            break
        all_transcripts.extend(transcripts)
        if len(transcripts) < batch_size:
            break
        offset += batch_size

    return all_transcripts


def extract_value_pair(definition_content) -> tuple:
    """Extract the two value names from definition dimensions.

    dimensions[0] = value_a (high score = 5 direction)
    dimensions[1] = value_b (low score = 1 direction)
    """
    content = definition_content if isinstance(definition_content, dict) else json.loads(definition_content)
    dimensions = content.get("dimensions", [])
    if len(dimensions) < 2:
        raise ValueError(f"Expected 2 dimensions, got {len(dimensions)}")
    return dimensions[0]["name"], dimensions[1]["name"]


def decision_to_outcome(decision_code: str) -> tuple:
    """Map decision code to (value_a_outcome, value_b_outcome).

    Decision scale:
        5 = strongly support value_a
        4 = somewhat support value_a
        3 = neutral
        2 = somewhat support value_b
        1 = strongly support value_b

    Returns: (value_a_outcome, value_b_outcome)
    """
    code = int(decision_code)
    if code >= 4:
        return ("prioritized", "deprioritized")
    elif code <= 2:
        return ("deprioritized", "prioritized")
    else:
        return ("neutral", "neutral")


def main():
    print("Cross-Model Value Analysis - Data Extraction")
    print("=" * 50)
    print(f"API: {API_URL}")
    print(f"Auth: {'API Key' if API_KEY else 'JWT'}")

    # Load run mapping
    with open(MAPPING_FILE) as f:
        run_mapping = json.load(f)
    print(f"\nLoaded {len(run_mapping)} run mappings from {MAPPING_FILE.name}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Cache definitions to avoid re-fetching
    def_cache: dict = {}
    rows = []

    for i, entry in enumerate(run_mapping, 1):
        run_id = entry["run_id"]
        def_id = entry["def_id"]
        name = entry["name"]

        print(f"\n[{i}/{len(run_mapping)}] {name}")
        print(f"  Run: {run_id}")

        # Get definition content (cached)
        if def_id not in def_cache:
            def_cache[def_id] = get_definition(def_id)
        definition = def_cache[def_id]
        value_a, value_b = extract_value_pair(definition["content"])

        # Get transcripts
        transcripts = get_transcripts_for_run(run_id)
        print(f"  Got {len(transcripts)} transcripts  (values: {value_a} vs {value_b})")

        skipped = 0
        for t in transcripts:
            dc = t["decisionCode"]
            if dc is None or not str(dc).isdigit():
                skipped += 1
                continue

            va_outcome, vb_outcome = decision_to_outcome(dc)
            scenario_content = t.get("scenario", {})
            if scenario_content:
                scenario_content = scenario_content.get("content", {})
            scenario_dims = scenario_content.get("dimensions", {}) if scenario_content else {}

            rows.append({
                "vignette_name": name,
                "vignette_id": def_id,
                "run_id": run_id,
                "value_a": value_a,
                "value_b": value_b,
                "model_id": t["modelId"],
                "decision_code": int(t["decisionCode"]),
                "value_a_outcome": va_outcome,
                "value_b_outcome": vb_outcome,
                "value_a_intensity": scenario_dims.get(value_a),
                "value_b_intensity": scenario_dims.get(value_b),
                "scenario_id": t.get("scenarioId", ""),
                "sample_index": t["sampleIndex"],
            })

        if skipped > 0:
            print(f"  Skipped {skipped} error/null transcripts")

    # Write CSV
    output_path = OUTPUT_DIR / "raw-data.csv"
    fieldnames = [
        "vignette_name", "vignette_id", "run_id",
        "value_a", "value_b", "model_id",
        "decision_code", "value_a_outcome", "value_b_outcome",
        "value_a_intensity", "value_b_intensity",
        "scenario_id", "sample_index",
    ]

    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n{'=' * 50}")
    print(f"Wrote {len(rows)} rows to {output_path}")

    # Summary stats
    models = set(r["model_id"] for r in rows)
    values = set()
    for r in rows:
        values.add(r["value_a"])
        values.add(r["value_b"])

    print(f"  Models: {len(models)} - {sorted(models)}")
    print(f"  Values: {len(values)} - {sorted(values)}")
    print(f"  Vignettes: {len(run_mapping)}")
    print(f"  Rows per model: ~{len(rows) // max(len(models), 1)}")


if __name__ == "__main__":
    main()
