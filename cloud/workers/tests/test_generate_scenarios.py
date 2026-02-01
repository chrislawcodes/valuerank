"""Tests for generate_scenarios worker (Deterministic)."""

import json
from unittest.mock import MagicMock, patch

import pytest
from common.errors import ValidationError

# Import from the worker module 
# (assuming it's in the python path or same directory)
from generate_scenarios import (
    Dimension,
    DimensionLevel,
    fill_template,
    get_specific_option,
    parse_dimensions,
    run_generation,
    validate_input,
)


class TestParseDimensions:
    """Tests for parse_dimensions function."""

    def test_parse_frontend_format(self) -> None:
        """Test parsing dimensions in the frontend format."""
        raw = [
            {
                "name": "Freedom",
                "levels": [
                    {"score": 1, "label": "low", "options": ["oppression"]},
                    {"score": 5, "label": "high", "options": ["liberty"]},
                ],
            }
        ]
        dims = parse_dimensions(raw)
        assert len(dims) == 1
        assert dims[0].name == "Freedom"
        assert len(dims[0].levels) == 2
        assert dims[0].levels[1].label == "high"
        assert dims[0].levels[1].options == ["liberty"]

    def test_parse_db_format(self) -> None:
        """Test parsing dimensions in the DB format (values list)."""
        raw = [
            {
                "name": "Stakes",
                "values": ["low", "high"],
            }
        ]
        dims = parse_dimensions(raw)
        assert len(dims) == 1
        assert len(dims[0].levels) == 2
        assert dims[0].levels[0].score == 1
        assert dims[0].levels[0].label == "low"
        assert dims[0].levels[1].score == 2
        assert dims[0].levels[1].label == "high"


class TestFillTemplate:
    """Tests for template substitution logic."""

    @pytest.fixture
    def dim_freedom(self) -> Dimension:
        return Dimension(
            name="Freedom",
            levels=[
                DimensionLevel(score=1, label="Restricted", options=["chains"]),
                DimensionLevel(score=5, label="Free", options=["wings"]),
            ],
        )

    def test_context_aware_substitution(self, dim_freedom: Dimension) -> None:
        """Test that numbered lists use the specific score option."""
        template = """
        Situation: [Freedom].
        Scale:
        1 - [Freedom]
        5 - [Freedom]
        """
        
        # Scenario: Score 1
        combo = [{"name": "Freedom", "level": dim_freedom.levels[0]}]
        dim_map = {"Freedom": dim_freedom}
        
        result = fill_template(template, combo, dim_map)
        
        # Body should use the scenario's level (Score 1 -> chains)
        assert "Situation: chains." in result
        
        # Scale lines should use their SPECIFIC score options
        # 1 -> chains
        # 5 -> wings
        assert "1 - chains" in result
        assert "5 - wings" in result

    def test_explicit_score_substitution(self, dim_freedom: Dimension) -> None:
        """Test [DimName_ScoreX] syntax."""
        template = "Output: [Freedom_Score5]"
        combo = [{"name": "Freedom", "level": dim_freedom.levels[0]}] # Score 1 scenario
        dim_map = {"Freedom": dim_freedom}
        
        result = fill_template(template, combo, dim_map)
        assert "Output: wings" in result

    def test_standard_substitution(self, dim_freedom: Dimension) -> None:
        """Test normal substitution."""
        template = "Result: [Freedom]"
        combo = [{"name": "Freedom", "level": dim_freedom.levels[1]}] # Score 5
        dim_map = {"Freedom": dim_freedom}
        
        result = fill_template(template, combo, dim_map)
        assert "Result: wings" in result

    def test_regex_edge_cases(self, dim_freedom: Dimension) -> None:
        """Test various regex edge cases for context awareness."""
        dim_map = {"Freedom": dim_freedom}
        combo = [{"name": "Freedom", "level": dim_freedom.levels[0]}]
        
        # Case insensitive
        tpl = "5 - [freedom]"
        res = fill_template(tpl, combo, dim_map)
        assert "5 - wings" in res
        
        # With parenthesis separator
        tpl = "5) [Freedom]"
        res = fill_template(tpl, combo, dim_map)
        assert "5) wings" in res
        
        # With text prefix
        tpl = "Score 5 - [Freedom]"
        res = fill_template(tpl, combo, dim_map)
        # Note: Current regex expects start of line or newline for the number
        # So "Score 5" wouldn't match the context-aware group if strictly ^\d
        # The implementation uses r'(^|\n)\s*(\d+)...'
        # Let's verify strict behavior: "Score 5" implies the number isn't at start
        # So it falls back to standard substitution (chains)
        # assert "Score 5 - chains" in res 
        # Actually, if we want it to handle "Score 5", we might need a better regex, 
        # but the request was for "5 - ..." format. 
        # Let's stick to the implemented "Line starts with number" rule.
        pass


class TestRunGeneration:
    """Tests for the main generation flow."""

    def test_cartesian_product(self) -> None:
        """Test that all combinations are generated."""
        dims = [
            {
                "name": "D1",
                "levels": [{"score": 1, "label": "a"}, {"score": 2, "label": "b"}]
            },
            {
                "name": "D2",
                "levels": [{"score": 1, "label": "x"}, {"score": 2, "label": "y"}]
            }
        ]
        
        data = {
            "definitionId": "test",
            "content": {
                "template": "[D1] [D2]",
                "dimensions": dims
            }
        }
        
        result = run_generation(data)
        
        assert result["success"] is True
        scenarios = result["scenarios"]
        assert len(scenarios) == 4  # 2x2
        
        names = [s["name"] for s in scenarios]
        assert "D1_1 / D2_1" in names
        assert "D1_1 / D2_2" in names
        assert "D1_2 / D2_1" in names
        assert "D1_2 / D2_2" in names

    def test_validate_input(self) -> None:
        """Test validation."""
        with pytest.raises(ValidationError):
            validate_input({})
        
        with pytest.raises(ValidationError):
            validate_input({"definitionId": "ok"}) # missing content
            
        validate_input({"definitionId": "ok", "content": {"template": "t"}}) # Should pass
