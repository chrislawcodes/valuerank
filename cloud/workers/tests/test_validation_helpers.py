"""Tests for common.validation helpers."""

import pytest

from common.errors import ValidationError
from common.validation import require_dict, require_field, require_fields, require_list


class TestRequireFields:
    def test_passes_when_all_fields_present(self) -> None:
        require_fields({"a": 1, "b": 2}, ["a", "b"])  # no exception

    def test_raises_on_first_missing_field(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            require_fields({"a": 1}, ["a", "b"])
        assert "Missing required field: b" in exc_info.value.message

    def test_details_list_all_required_fields(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            require_fields({}, ["x", "y"])
        assert exc_info.value.details is not None
        assert "x" in exc_info.value.details
        assert "y" in exc_info.value.details

    def test_empty_fields_list_always_passes(self) -> None:
        require_fields({}, [])  # no exception


class TestRequireField:
    def test_passes_when_field_present(self) -> None:
        require_field({"runId": "abc"}, "runId")  # no exception

    def test_raises_when_field_absent(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            require_field({}, "runId")
        assert "Missing required field: runId" in exc_info.value.message

    def test_no_details_field(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            require_field({}, "x")
        assert exc_info.value.details is None


class TestRequireList:
    def test_passes_when_list(self) -> None:
        require_list({"items": []}, "items")  # no exception

    def test_raises_when_not_list(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            require_list({"items": "not a list"}, "items")
        assert "items must be an array" in exc_info.value.message

    def test_raises_when_dict(self) -> None:
        with pytest.raises(ValidationError):
            require_list({"items": {}}, "items")


class TestRequireDict:
    def test_passes_when_dict(self) -> None:
        require_dict({"obj": {}}, "obj")  # no exception

    def test_raises_when_not_dict(self) -> None:
        with pytest.raises(ValidationError) as exc_info:
            require_dict({"obj": "not a dict"}, "obj")
        assert "obj must be an object" in exc_info.value.message

    def test_raises_when_list(self) -> None:
        with pytest.raises(ValidationError):
            require_dict({"obj": []}, "obj")
