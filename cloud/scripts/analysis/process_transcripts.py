#!/usr/bin/env python3
"""Process transcript JSON data into CSV rows.

Usage: python process_transcripts.py <input.json> [--append output.csv]

The input JSON should have structure:
{
  "run_id": "...",
  "vignette_name": "...",
  "value_a": "...",
  "value_b": "...",
  "transcripts": [{"modelId": "...", "decisionCode": "..."}, ...]
}
"""
import json
import csv
import sys
from pathlib import Path

def decision_to_outcome(code_str):
    code = int(code_str)
    if code >= 4:
        return ("prioritized", "deprioritized")
    elif code <= 2:
        return ("deprioritized", "prioritized")
    else:
        return ("neutral", "neutral")

def process_file(input_path, output_path, append=False):
    with open(input_path) as f:
        data = json.load(f)

    rows = []
    for t in data["transcripts"]:
        dc = t.get("decisionCode")
        if dc is None or dc == "error":
            continue
        va_out, vb_out = decision_to_outcome(dc)
        rows.append({
            "vignette_name": data["vignette_name"],
            "run_id": data["run_id"],
            "value_a": data["value_a"],
            "value_b": data["value_b"],
            "model_id": t["modelId"],
            "decision_code": int(dc),
            "value_a_outcome": va_out,
            "value_b_outcome": vb_out,
        })

    mode = "a" if append else "w"
    write_header = not append or not Path(output_path).exists() or Path(output_path).stat().st_size == 0

    fieldnames = ["vignette_name", "run_id", "value_a", "value_b", "model_id",
                  "decision_code", "value_a_outcome", "value_b_outcome"]

    with open(output_path, mode, newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if write_header:
            writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows ({'appended' if append else 'new'}) to {output_path}")
    return len(rows)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python process_transcripts.py <input.json> [--append output.csv]")
        sys.exit(1)

    input_path = sys.argv[1]
    append = "--append" in sys.argv
    output_path = sys.argv[sys.argv.index("--append") + 1] if append else "output/batch-extra.csv"

    process_file(input_path, output_path, append)
