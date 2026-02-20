#!/usr/bin/env python3
"""Combine batch CSV files into raw-data.csv."""
import csv
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent / "output"

def main():
    all_rows = []
    header = None

    for i in range(1, 6):
        batch_file = OUTPUT_DIR / f"batch-{i}.csv"
        if not batch_file.exists():
            print(f"WARNING: {batch_file} not found, skipping")
            continue

        with open(batch_file) as f:
            reader = csv.DictReader(f)
            if header is None:
                header = reader.fieldnames
            rows = list(reader)
            all_rows.extend(rows)
            print(f"batch-{i}.csv: {len(rows)} rows")

    if not header or not all_rows:
        print("ERROR: No data found")
        return

    output_path = OUTPUT_DIR / "raw-data.csv"
    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=header)
        writer.writeheader()
        writer.writerows(all_rows)

    # Stats
    models = set(r["model_id"] for r in all_rows)
    values = set()
    vignettes = set()
    for r in all_rows:
        values.add(r["value_a"])
        values.add(r["value_b"])
        vignettes.add(r["vignette_name"])

    print(f"\nCombined: {len(all_rows)} rows -> {output_path}")
    print(f"  Vignettes: {len(vignettes)}")
    print(f"  Models: {len(models)} - {sorted(models)}")
    print(f"  Values: {len(values)} - {sorted(values)}")

if __name__ == "__main__":
    main()
