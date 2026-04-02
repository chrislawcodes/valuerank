#!/usr/bin/env python3
"""
Track Claude token usage for the current project since a given timestamp.

Usage:
  token-usage.py snapshot               # print current UTC timestamp (save as feature start marker)
  token-usage.py since <iso-timestamp>  # print tokens used by THIS project since that timestamp
  token-usage.py total <marker-file>    # read timestamp from a file, print totals + human-readable summary

Reads ONLY session jsonl files for the current working directory's project.
This isolates token counts per worktree — parallel experiment paths don't bleed
into each other even when run simultaneously.

Claude Code maps each working directory to a project slug:
  ~/.claude/projects/<slug>/*.jsonl
where slug = cwd with '/' replaced by '-' (leading '-' stripped).

Token buckets:
  input_tokens                — new prompt tokens
  cache_creation_input_tokens — tokens written to prompt cache
  cache_read_input_tokens     — tokens read from prompt cache (cheap)
  output_tokens               — tokens generated

The number that best represents "how much Claude work did this feature take":
  input_tokens + cache_creation_input_tokens + output_tokens
  (cache reads are ~10x cheaper and don't reflect new work done)
"""

import sys
import json
import os
import glob
from datetime import datetime, timezone
from pathlib import Path


def project_dir_for_cwd() -> Path:
    """Return ~/.claude/projects/<slug> for the current working directory.

    Claude Code slugifies the cwd by replacing both '/' and '.' with '-'.
    The leading '-' from the leading '/' is kept. Examples:
      /Users/foo/myrepo         →  -Users-foo-myrepo
      /Users/foo/.claude/worktrees/bar  →  -Users-foo--claude-worktrees-bar
    """
    cwd = os.getcwd()
    slug = cwd.replace("/", "-").replace(".", "-")
    return Path.home() / ".claude" / "projects" / slug


def find_project_jsonls() -> list[str]:
    project_dir = project_dir_for_cwd()
    if not project_dir.exists():
        return []
    return glob.glob(str(project_dir / "*.jsonl"))


def sum_tokens_since(since_ts: str) -> dict:
    since = datetime.fromisoformat(since_ts.replace("Z", "+00:00"))
    input_tokens = 0
    cache_creation = 0
    cache_read = 0
    output_tokens = 0

    for jsonl_path in find_project_jsonls():
        try:
            with open(jsonl_path) as f:
                for line in f:
                    try:
                        d = json.loads(line)
                        ts_str = d.get("timestamp") or d.get("message", {}).get("timestamp")
                        if not ts_str:
                            continue
                        ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                        if ts < since:
                            continue
                        usage = d.get("message", {}).get("usage") or d.get("usage") or {}
                        input_tokens += usage.get("input_tokens", 0)
                        cache_creation += usage.get("cache_creation_input_tokens", 0)
                        cache_read += usage.get("cache_read_input_tokens", 0)
                        output_tokens += usage.get("output_tokens", 0)
                    except Exception:
                        continue
        except Exception:
            continue

    return {
        "input_tokens": input_tokens,
        "cache_creation_input_tokens": cache_creation,
        "cache_read_input_tokens": cache_read,
        "output_tokens": output_tokens,
        "total_billed_input": input_tokens + cache_creation,
    }


def format_summary(result: dict) -> str:
    lines = [
        f"  input_tokens:                {result['input_tokens']:>12,}",
        f"  cache_creation_input_tokens: {result['cache_creation_input_tokens']:>12,}",
        f"  cache_read_input_tokens:     {result['cache_read_input_tokens']:>12,}",
        f"  output_tokens:               {result['output_tokens']:>12,}",
        f"  ─────────────────────────────────────────────",
        f"  total_billed_input:          {result['total_billed_input']:>12,}  (input + cache_creation)",
    ]
    return "\n".join(lines)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "snapshot":
        now = datetime.now(timezone.utc).isoformat()
        print(now)

    elif cmd == "since":
        if len(sys.argv) < 3:
            print("Usage: token-usage.py since <iso-timestamp>")
            sys.exit(1)
        since_ts = sys.argv[2]
        result = sum_tokens_since(since_ts)
        print(json.dumps(result, indent=2))
        print()
        print(format_summary(result))

    elif cmd == "total":
        if len(sys.argv) < 3:
            print("Usage: token-usage.py total <marker-file>")
            sys.exit(1)
        marker_file = sys.argv[2]
        try:
            since_ts = open(marker_file).read().strip()
        except FileNotFoundError:
            print(f"Marker file not found: {marker_file}")
            sys.exit(1)
        result = sum_tokens_since(since_ts)
        print(f"Tokens since {since_ts}:")
        print()
        print(format_summary(result))
        print()
        print(json.dumps(result, indent=2))

    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)


if __name__ == "__main__":
    main()
