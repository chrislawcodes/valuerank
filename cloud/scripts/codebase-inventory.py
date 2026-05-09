#!/usr/bin/env python3
"""Generate a Markdown inventory of selected code areas in the repo."""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable, Sequence


DIRECTORIES: Sequence[str] = (
    "cloud/apps/api/src/services/",
    "cloud/apps/api/src/graphql/queries/",
    "cloud/apps/api/src/graphql/types/",
    "cloud/apps/api/src/graphql/mutations/",
    "cloud/workers/",
)

SKIP_DIR_NAMES = {"tests", "__pycache__", "node_modules", "dist", "build"}

TS_VALUE_RE = re.compile(
    r"^\s*export\s+(?:async\s+function|function|class|const|let|var)\s+([A-Za-z_$][\w$]*)\b"
)
TS_TYPE_RE = re.compile(r"^\s*export\s+(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)\b")
TS_REEXPORT_RE = re.compile(r"^\s*export\s+(type\s+)?\{\s*([^}]*)\s*\}(?:\s+from\b.*)?$")

PY_DEF_RE = re.compile(r"^(?:async\s+def|def)\s+([A-Za-z_]\w*)\s*\(")
PY_CLASS_RE = re.compile(r"^class\s+([A-Za-z_]\w*)\b")
PY_CONST_RE = re.compile(r"^([A-Z_][A-Z_0-9]*)(?:\s*:\s*[^=]+)?\s*=")


@dataclass(frozen=True)
class FileInventory:
    path: str
    exports: list[str]
    types: list[str]
    description: str | None


@dataclass(frozen=True)
class SectionInventory:
    directory: str
    files: list[FileInventory]
    directory_exists: bool


def detect_repo_root(cwd: Path | None = None) -> Path:
    working_dir = cwd or Path.cwd()
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=working_dir,
            capture_output=True,
            text=True,
            check=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return working_dir
    root = result.stdout.strip()
    return Path(root) if root else working_dir


def read_text(path: Path) -> str | None:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        print(f"warning: could not read {path}: {exc}", file=sys.stderr)
        return None
    if text == "":
        print(f"warning: skipping empty file {path}", file=sys.stderr)
        return None
    return text


def _unique_preserve_order(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            result.append(item)
    return result


def _normalize_comment_line(line: str) -> str:
    return re.sub(r"^\s*\* ?", "", line).strip()


def _extract_block_first_line(lines: list[str], opener: str, closer: str) -> str | None:
    if not lines:
        return None
    first = lines[0].strip()
    if not first.startswith(opener):
        return None
    content: list[str] = []
    inline = first[len(opener) :]
    if closer in inline:
        content.append(inline.split(closer, 1)[0])
    else:
        if inline:
            content.append(inline)
        for line in lines[1:]:
            if closer in line:
                content.append(line.split(closer, 1)[0])
                break
            content.append(line)
    for raw in content:
        cleaned = _normalize_comment_line(raw)
        if cleaned:
            return cleaned
    return None


def _skip_block_comment(lines: list[str], start: int) -> int:
    for index in range(start + 1, len(lines)):
        if "*/" in lines[index]:
            return index + 1
    return len(lines)


def extract_ts_description(text: str) -> str | None:
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if not stripped:
            i += 1
            continue
        if stripped.startswith("/**"):
            block_lines = [lines[i]]
            for j in range(i + 1, len(lines)):
                block_lines.append(lines[j])
                if "*/" in lines[j]:
                    break
            return _extract_block_first_line(block_lines, "/**", "*/")
        if stripped.startswith("//") or stripped.startswith("*"):
            i += 1
            continue
        if stripped.startswith("/*"):
            i = _skip_block_comment(lines, i)
            continue
        if stripped.startswith("import ") or stripped.startswith("export "):
            return None
        return None
    return None


def extract_ts_exports(text: str) -> list[str]:
    exports: list[str] = []
    types: list[str] = []
    for line in text.splitlines():
        value_match = TS_VALUE_RE.match(line)
        if value_match:
            exports.append(value_match.group(1))
            continue
        type_match = TS_TYPE_RE.match(line)
        if type_match:
            types.append(type_match.group(1))
            continue
        reexport_match = TS_REEXPORT_RE.match(line)
        if reexport_match:
            bucket = types if reexport_match.group(1) else exports
            for item in reexport_match.group(2).split(","):
                part = item.strip()
                if not part:
                    continue
                alias_match = re.match(
                    r"^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$",
                    part,
                )
                if alias_match:
                    bucket.append(alias_match.group(2) or alias_match.group(1))
    return _unique_preserve_order(exports)


def extract_ts_types(text: str) -> list[str]:
    types: list[str] = []
    for line in text.splitlines():
        type_match = TS_TYPE_RE.match(line)
        if type_match:
            types.append(type_match.group(1))
            continue
        reexport_match = TS_REEXPORT_RE.match(line)
        if reexport_match and reexport_match.group(1):
            for item in reexport_match.group(2).split(","):
                part = item.strip()
                if not part:
                    continue
                alias_match = re.match(
                    r"^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$",
                    part,
                )
                if alias_match:
                    types.append(alias_match.group(2) or alias_match.group(1))
    return _unique_preserve_order(types)


def extract_py_description(text: str) -> str | None:
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if not stripped:
            i += 1
            continue
        if re.match(r"^(?:from\b.*\bimport\b|import\b)", stripped):
            i += 1
            continue
        if stripped.startswith(("'''", '"""')):
            quote = stripped[:3]
            block_lines = [lines[i]]
            for j in range(i + 1, len(lines)):
                block_lines.append(lines[j])
                if quote in lines[j]:
                    break
            return _extract_block_first_line(block_lines, quote, quote)
        if stripped.startswith("#"):
            i += 1
            continue
        return None
    return None


def extract_py_exports(text: str) -> list[str]:
    exports: list[str] = []
    for line in text.splitlines():
        if match := PY_DEF_RE.match(line):
            exports.append(match.group(1))
            continue
        if match := PY_CLASS_RE.match(line):
            exports.append(match.group(1))
            continue
        if match := PY_CONST_RE.match(line):
            exports.append(match.group(1))
    return _unique_preserve_order(exports)


def _format_symbol_list(symbols: Sequence[str]) -> str:
    if not symbols:
        return "—"
    if len(symbols) <= 6:
        return ", ".join(symbols)
    extra = len(symbols) - 6
    return ", ".join(symbols[:6]) + f", (+{extra} more)"


def _format_description(description: str | None) -> str:
    text = description or "(no docstring)"
    if len(text) > 80:
        return text[:80] + "..."
    return text


def _inventory_for_file(path: Path, root: Path) -> FileInventory | None:
    text = read_text(path)
    if text is None:
        return None
    if path.suffix == ".ts":
        exports = extract_ts_exports(text)
        types = extract_ts_types(text)
        description = extract_ts_description(text)
    elif path.suffix == ".py":
        exports = extract_py_exports(text)
        types = []
        description = extract_py_description(text)
    else:
        return None
    return FileInventory(
        path=path.relative_to(root).as_posix(),
        exports=exports,
        types=types,
        description=description,
    )


def _walk_section(root: Path, directory: str, suffix: str) -> SectionInventory:
    directory_path = root / directory
    if not directory_path.is_dir():
        return SectionInventory(directory=directory, files=[], directory_exists=False)

    files: list[FileInventory] = []
    for current_root, dirnames, filenames in os.walk(directory_path, topdown=True):
        dirnames[:] = sorted(
            dirname for dirname in dirnames if dirname not in SKIP_DIR_NAMES
        )
        for filename in sorted(filenames):
            if suffix == ".ts":
                if not filename.endswith(".ts"):
                    continue
            else:
                if not filename.endswith(".py"):
                    continue
            if filename.endswith(".test.ts") or filename.endswith(".spec.ts") or filename.endswith(".test.py"):
                continue
            file_path = Path(current_root) / filename
            entry = _inventory_for_file(file_path, root)
            if entry is not None:
                files.append(entry)

    files.sort(key=lambda item: item.path)
    return SectionInventory(directory=directory, files=files, directory_exists=True)


def build_inventory(root: Path) -> list[SectionInventory]:
    resolved_root = root.resolve()
    sections: list[SectionInventory] = []
    for directory in DIRECTORIES:
        suffix = ".py" if directory == "cloud/workers/" else ".ts"
        sections.append(_walk_section(resolved_root, directory, suffix))
    return sections


def render_report(sections: Sequence[SectionInventory]) -> str:
    lines = ["# Codebase Inventory", "", f"Generated: {date.today().isoformat()}", ""]
    for section in sections:
        lines.append(f"## {section.directory}")
        lines.append("")
        if not section.directory_exists:
            lines.append("(directory not found)")
            lines.append("")
            continue
        if not section.files:
            lines.append("(no files found)")
            lines.append("")
            continue
        lines.append("| path | exports | types | description |")
        lines.append("| --- | --- | --- | --- |")
        for entry in section.files:
            lines.append(
                "| "
                + " | ".join(
                    [
                        entry.path,
                        _format_symbol_list(entry.exports),
                        _format_symbol_list(entry.types),
                        _format_description(entry.description),
                    ]
                )
                + " |"
            )
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate a codebase inventory.")
    parser.add_argument("--out", help="Write the report to a file instead of stdout.")
    parser.add_argument(
        "--root",
        help="Repository root override. Defaults to git rev-parse --show-toplevel, then '.'.",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    root = Path(args.root) if args.root else detect_repo_root()
    if not root.exists() or not root.is_dir():
        print(f"error: repo root not found: {root}", file=sys.stderr)
        return 1

    sections = build_inventory(root)
    report = render_report(sections)

    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(report, encoding="utf-8")
    else:
        sys.stdout.write(report)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
