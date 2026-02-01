#!/usr/bin/env python3
"""
Scenario Generation Worker - Expands definition templates into scenarios using deterministic substitution.

Protocol:
- Reads JSON input from stdin
- Writes JSON output to stdout
- Logs structured JSON to stderr
"""

import json
import re
import sys
import time
import random
import itertools
from dataclasses import dataclass, field
from typing import Any, Optional, Dict, List

from common.errors import ErrorCode, ValidationError, classify_exception
from common.logging import get_logger

log = get_logger("generate_scenarios")


@dataclass
class DimensionLevel:
    """A level within a dimension."""
    score: int
    label: string
    options: List[str] = field(default_factory=list)


@dataclass
class Dimension:
    """A scenario dimension with levels."""
    name: str
    levels: List[DimensionLevel] = field(default_factory=list)


def parse_dimensions(raw_dimensions: List[Dict[str, Any]]) -> List[Dimension]:
    """Parse dimension data from input."""
    dimensions = []
    for raw_dim in raw_dimensions:
        name = raw_dim.get("name", "")
        levels = []

        # Handle frontend format with levels
        if "levels" in raw_dim:
            for level_data in raw_dim["levels"]:
                level = DimensionLevel(
                    score=level_data.get("score", 1),
                    label=level_data.get("label", ""),
                    options=level_data.get("options", [level_data.get("label", "")]),
                )
                levels.append(level)
        # Handle DB schema format with just values
        elif "values" in raw_dim:
            for i, value in enumerate(raw_dim["values"]):
                levels.append(DimensionLevel(score=i + 1, label=value, options=[value]))

        if name and levels:
            dimensions.append(Dimension(name=name, levels=levels))

    return dimensions


def normalize_preamble(preamble: Optional[str]) -> Optional[str]:
    """Normalize preamble - returns None if empty or whitespace-only."""
    if not preamble or not preamble.strip():
        return None
    return preamble


def get_option_for_level(level: DimensionLevel) -> str:
    """Get a random option from the level, or label if no options."""
    if level.options:
        return random.choice(level.options)
    return level.label


def get_specific_option(dim: Dimension, score: int) -> str:
    """Get option for a specific score in a dimension."""
    for level in dim.levels:
        if level.score == int(score):
            return get_option_for_level(level)
    return f"[{dim.name}_Score{score}]"  # Fallback if not found


def fill_template(
    template: str,
    combination: List[Dict[str, Any]],
    dimensions_map: Dict[str, Dimension]
) -> str:
    """
    Replace template placeholders with dimension values.
    
    1. Context-Aware Substitution: Handles numbered lists like "5 - [DimName]"
       by using the specific score's option.
    2. Explicit Score Substitution: Handles [DimName_ScoreX].
    3. Standard Substitution: Replaces [DimName] with the current combination's value.
    """
    result = template

    # Pass 1: Context-Aware Substitution (Scale detection)
    # Looks for lines starting with a number, followed by punctuation, then text containing [DimName]
    # Regex: Start of line or newline, capture number, separator, content, [DimName]
    # We iterate over dimensions to find them in the text
    
    for dim_name, dim in dimensions_map.items():
        # Pattern for "5 - [DimName]" or "1. [DimName]"
        # Group 1: The Score (number)
        # Group 2: The separator and prefix text
        pattern = re.compile(
            r'(^|\n)\s*(\d+)(\s*[-.)]\s*.*?)\[(' + re.escape(dim_name) + r')\]',
            re.IGNORECASE
        )
        
        def replace_scale_match(match):
            prefix = match.group(1)
            score = match.group(2)
            separator = match.group(3)
            # dim_matched = match.group(4)
            
            # Find the option for this score
            option = get_specific_option(dim, score)
            
            return f"{prefix}{score}{separator}{option}"

        result = pattern.sub(replace_scale_match, result)
    
    # Pass 2: Explicit Score Substitution [DimName_ScoreX]
    for dim_name, dim in dimensions_map.items():
        pattern = re.compile(r'\[' + re.escape(dim_name) + r'_Score(\d+)\]', re.IGNORECASE)
        
        def replace_explicit_match(match):
            score = match.group(1)
            return get_specific_option(dim, score)
            
        result = pattern.sub(replace_explicit_match, result)

    # Pass 3: Standard Substitution
    for item in combination:
        dim_name = item['name']
        level = item['level']
        option = get_option_for_level(level)
        
        # Replace [DimName] case-insensitive
        pattern = re.compile(r'\[' + re.escape(dim_name) + r'\]', re.IGNORECASE)
        result = pattern.sub(option, result)

    return result


def generate_scenario_name(combination: List[Dict[str, Any]]) -> str:
    """Generate scenario name: Dim1_ScoreX / Dim2_ScoreY"""
    parts = []
    for item in combination:
        parts.append(f"{item['name']}_{item['level'].score}")
    return " / ".join(parts)


def validate_input(data: Dict[str, Any]) -> None:
    """Validate worker input."""
    if "definitionId" not in data:
        raise ValidationError("Missing required field: definitionId")
    
    content = data.get("content")
    if not isinstance(content, dict):
        raise ValidationError("content must be an object")

    if "template" not in content:
        raise ValidationError("content.template is required")


def run_generation(data: Dict[str, Any]) -> Dict[str, Any]:
    """Execute the deterministic scenario generation."""
    definition_id = data["definitionId"]
    content = data.get("content", {})
    
    template = content.get("template", "")
    raw_dimensions = content.get("dimensions", [])
    
    log.info(
        "Starting deterministic scenario generation",
        definitionId=definition_id,
        dimensionCount=len(raw_dimensions),
    )

    # Parse dimensions
    dimensions = parse_dimensions(raw_dimensions)
    dimensions_map = {d.name: d for d in dimensions}

    # Generate all combinations (Cartesian product)
    # Each element in product is a tuple of levels corresponding to dimensions
    
    # Prepare lists of levels
    levels_lists = []
    for dim in dimensions:
        # Store as dict to keep track of dimension name
        dim_levels = [{'name': dim.name, 'level': lvl} for lvl in dim.levels]
        levels_lists.append(dim_levels)
    
    combinations = list(itertools.product(*levels_lists)) if levels_lists else [[]]
    
    log.info(
        "Generated dimension combinations",
        combinationCount=len(combinations)
    )

    generated_scenarios = []
    
    for combo_tuple in combinations:
        # combo_tuple is a tuple of dicts: ({name: 'A', level: ...}, {name: 'B', level: ...})
        combo_list = list(combo_tuple)
        
        # Build dimension scores map
        dim_scores = {}
        for item in combo_list:
            dim_scores[item['name']] = item['level'].score
            
        # Fill template
        prompt = fill_template(template, combo_list, dimensions_map)
        
        # Build Name
        name = generate_scenario_name(combo_list)
        
        generated_scenarios.append({
            "name": name,
            "content": {
                "preamble": normalize_preamble(content.get("preamble")),
                "prompt": prompt,
                "dimensions": dim_scores
            }
        })

    return {
        "success": True,
        "scenarios": generated_scenarios,
        "metadata": {
            "inputTokens": 0,
            "outputTokens": 0,
            "modelVersion": "deterministic"
        },
        "debug": {
            "rawResponse": None,
            "extractedYaml": None,
            "parseError": None
        }
    }


def main() -> None:
    """Main entry point."""
    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            print(json.dumps({
                "success": False, 
                "error": {"message": "No input provided", "code": ErrorCode.VALIDATION_ERROR.value}
            }))
            return

        data = json.loads(input_data)
        validate_input(data)
        result = run_generation(data)
        print(json.dumps(result))

    except Exception as err:
        log.error("Unexpected error in generate_scenarios worker", err=err)
        result = {
            "success": False,
            "error": {
                "message": str(err),
                "code": ErrorCode.UNKNOWN.value,
                "retryable": False
            }
        }
        print(json.dumps(result))


if __name__ == "__main__":
    main()
