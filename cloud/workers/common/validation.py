"""Shared validation helpers for worker input checks."""

from __future__ import annotations

from typing import Any

from common.errors import ValidationError


def require_fields(data: dict[str, Any], fields: list[str]) -> None:
    """Raise ValidationError if any field in *fields* is absent from *data*.

    Error message: "Missing required field: {field_name}"
    Details: "Input must include: {', '.join(fields)}"
    Used by: summarize.py, probe.py
    """
    for field_name in fields:
        if field_name not in data:
            raise ValidationError(
                message=f"Missing required field: {field_name}",
                details=f"Input must include: {', '.join(fields)}",
            )


def require_field(data: dict[str, Any], name: str) -> None:
    """Raise ValidationError if *name* is absent from *data*.

    Error message: "Missing required field: {name}"
    Used by: compute_token_stats.py, analyze_basic_aggregation.py, generate_scenarios.py
    """
    if name not in data:
        raise ValidationError(message=f"Missing required field: {name}")


def require_list(data: dict[str, Any], name: str) -> None:
    """Raise ValidationError if data[name] is not a list.

    Assumes the field is already present; call require_field first if needed.
    Error message: "{name} must be an array"
    Used by: compute_token_stats.py, analyze_basic_aggregation.py
    """
    if not isinstance(data[name], list):
        raise ValidationError(message=f"{name} must be an array")


def require_dict(data: dict[str, Any], name: str) -> None:
    """Raise ValidationError if data[name] is not a dict.

    Assumes the field is already present; call require_field first if needed.
    Error message: "{name} must be an object"
    Used by: summarize.py, generate_scenarios.py
    """
    if not isinstance(data[name], dict):
        raise ValidationError(message=f"{name} must be an object")
