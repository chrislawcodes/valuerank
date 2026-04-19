#!/usr/bin/env python3
"""
Re-run the summarize worker's decision parser against a transcript's content
and print the result as JSON.

Used by `backfill-reparse-decisions.ts` to recover decisions that were
previously tagged as ambiguous (decisionCode='other', strength='unknown')
before the level-word-tolerance fix landed (PR #694).

Reads a JSON object with a single `transcriptContent` field from stdin.
Writes a JSON object with `decisionCode`, `decisionSource`, and
`decisionMetadata` to stdout.
"""

import json
import os
import sys

# Put the workers directory on sys.path so we can import the parser directly.
_HERE = os.path.dirname(os.path.abspath(__file__))
_WORKERS = os.path.abspath(os.path.join(_HERE, "..", "workers"))
if _WORKERS not in sys.path:
    sys.path.insert(0, _WORKERS)

# Import AFTER sys.path is fixed. Note: summarize.py imports common.* which
# requires workers/ on the path; that's why we set sys.path above.
from summarize import extract_decision_result  # noqa: E402


def main() -> None:
    payload = json.load(sys.stdin)
    content = payload["transcriptContent"]
    result = extract_decision_result(content)
    json.dump(result, sys.stdout)


if __name__ == "__main__":
    main()
