#!/usr/bin/env python3
"""
Scenario Generation Worker - Expands definition templates into scenarios using LLM.

Protocol:
- Reads JSON input from stdin
- Writes JSON output to stdout
- Logs structured JSON to stderr

Input format (GenerateScenariosInput):
{
  "definitionId": string,
  "modelId": string,  // e.g., "deepseek:deepseek-reasoner" or "anthropic:claude-3-5-haiku-20241022"
  "content": {
    "preamble": string | null,
    "template": string,
    "dimensions": [
      {
        "name": string,
        "levels": [{ "score": number, "label": string, "options": [string] }]
      }
    ],
    "matching_rules": string | null
  },
  "config": {
    "temperature": number,  // default: 0.7
    "maxTokens": number     // default: 8192
  },
  "modelConfig": {  // Optional - provider-specific API configuration from database
    "maxTokensParam": string,  // e.g., "max_completion_tokens" for newer OpenAI models
    ...
  }
}

Output format (GenerateScenariosOutput):
Success:
{
  "success": true,
  "scenarios": [
    {
      "name": string,
      "content": {
        "preamble": string | null,
        "prompt": string,
        "dimensions": { [dimName]: number }
      }
    }
  ],
  "metadata": {
    "inputTokens": number,
    "outputTokens": number,
    "modelVersion": string | null
  }
}

Error:
{
  "success": false,
  "error": {
    "message": string,
    "code": string,
    "retryable": boolean,
    "details": string | null
  }
}
"""

import json
import re
import sys
from dataclasses import dataclass, field
from functools import reduce
from typing import Any, Optional

import yaml

from common.errors import ErrorCode, LLMError, ValidationError, WorkerError, classify_exception
from common.llm_adapters import generate
from common.logging import get_logger

log = get_logger("generate_scenarios")


def emit_progress(
    phase: str,
    expected_scenarios: int = 0,
    generated_scenarios: int = 0,
    input_tokens: int = 0,
    output_tokens: int = 0,
    message: str = "",
) -> None:
    """
    Emit a progress update to stderr.

    Progress is emitted as a JSON line with type="progress" which
    TypeScript can parse and use to update the database.
    """
    progress = {
        "type": "progress",
        "phase": phase,
        "expectedScenarios": expected_scenarios,
        "generatedScenarios": generated_scenarios,
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "message": message,
    }
    # Write to stderr as a single line
    sys.stderr.write(json.dumps(progress) + "\n")
    sys.stderr.flush()


@dataclass
class DimensionLevel:
    """A level within a dimension."""
    score: int
    label: str
    options: list[str] = field(default_factory=list)


@dataclass
class Dimension:
    """A scenario dimension with levels."""
    name: str
    levels: list[DimensionLevel] = field(default_factory=list)


@dataclass
class GeneratedScenario:
    """A scenario generated from the template."""
    name: str
    preamble: Optional[str]
    prompt: str
    dimensions: dict[str, int]  # dimension name -> score

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON output."""
        return {
            "name": self.name,
            "content": {
                "preamble": self.preamble,
                "prompt": self.prompt,
                "dimensions": self.dimensions,
            },
        }


@dataclass
class GenerationMetadata:
    """Metadata about the LLM generation."""
    input_tokens: int = 0
    output_tokens: int = 0
    model_version: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "inputTokens": self.input_tokens,
            "outputTokens": self.output_tokens,
            "modelVersion": self.model_version,
        }


def normalize_preamble(preamble: Optional[str]) -> Optional[str]:
    """Normalize preamble - returns None if empty or whitespace-only."""
    if not preamble or not preamble.strip():
        return None
    return preamble


def parse_dimensions(raw_dimensions: list[dict[str, Any]]) -> list[Dimension]:
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


def build_generation_prompt(
    preamble: Optional[str],
    template: str,
    dimensions: list[Dimension],
    matching_rules: Optional[str],
) -> str:
    """Build the LLM prompt for scenario generation."""
    dimension_defs = []
    for dim in dimensions:
        value_lines = [
            f"  Score {level.score} ({level.label}): {', '.join(level.options)}"
            for level in dim.levels
        ]
        dimension_defs.append(f"{dim.name}:\n" + "\n".join(value_lines))

    dimension_text = "\n\n".join(dimension_defs)
    placeholders = ", ".join(f"[{dim.name}]" for dim in dimensions)
    base_id = "scenario"
    category = "_vs_".join(dim.name for dim in dimensions)

    # Build preamble section
    normalized_preamble = normalize_preamble(preamble)
    has_preamble = normalized_preamble is not None
    preamble_section = ""
    if has_preamble:
        preamble_section = f"""## Preamble (use exactly):
{normalized_preamble}

"""

    # Build output format
    if has_preamble:
        output_format = f"""```yaml
preamble: >
  [the preamble text]

scenarios:
  {base_id}_[Dim1Score]_[Dim2Score]_...:
    base_id: {base_id}
    category: {category}
    subject: [descriptive title with scores]
    body: |
      [filled template with natural grammar]
```"""
    else:
        output_format = f"""```yaml
scenarios:
  {base_id}_[Dim1Score]_[Dim2Score]_...:
    base_id: {base_id}
    category: {category}
    subject: [descriptive title with scores]
    body: |
      [filled template with natural grammar]
```"""

    matching_section = ""
    if matching_rules:
        matching_section = f"## Matching Rules:\n{matching_rules}"

    return f"""You are a scenario generator for a moral values research project. Generate a YAML file with all valid combinations of the following dimensions.

{preamble_section}## Scenario Template:
The template uses these placeholders: {placeholders}
Each placeholder should be replaced with an option from the corresponding dimension score.

Template:
{template}

## Dimensions and Scores:
{dimension_text}

{matching_section}

## Output Format:
Generate valid YAML with this structure:
{output_format}

Generate ALL valid combinations. For each combination:
1. Pick a random option from each dimension's score level
2. Replace placeholders in the template
3. Smooth the grammar so sentences flow naturally
4. Use the naming convention: {base_id}_[Dim1Name][Score]_[Dim2Name][Score]_...

{"Skip combinations that violate the matching rules." if matching_rules else ""}

Output ONLY the YAML, no explanations."""


def extract_yaml(response: str) -> str:
    """Extract YAML content from LLM response."""
    # Try to find yaml/yml code block
    yaml_match = re.search(r"```ya?ml\n(.*?)```", response, re.DOTALL)
    if yaml_match:
        return yaml_match.group(1).strip()

    # Try to find content starting with "preamble:" or "scenarios:"
    for marker in ["preamble:", "scenarios:"]:
        idx = response.find(marker)
        if idx != -1:
            return response[idx:].strip()

    # Return as-is if no markers found
    return response


def parse_generated_scenarios(
    yaml_content: str,
    dimensions: list[Dimension],
    default_preamble: Optional[str],
) -> list[GeneratedScenario]:
    """Parse the LLM-generated YAML into scenario data."""
    try:
        parsed = yaml.safe_load(yaml_content)
    except yaml.YAMLError as err:
        log.error("Failed to parse YAML", err=str(err))
        return []

    if not parsed or not isinstance(parsed, dict):
        return []

    scenarios_data = parsed.get("scenarios", {})
    if not scenarios_data:
        return []

    # Use preamble from YAML if present, otherwise use default
    yaml_preamble = normalize_preamble(parsed.get("preamble"))
    preamble = yaml_preamble if yaml_preamble else default_preamble

    scenarios = []
    for scenario_key, scenario_data in scenarios_data.items():
        if not isinstance(scenario_data, dict):
            continue

        body = scenario_data.get("body", "")
        if not body:
            continue

        # Extract dimension scores from the scenario key (e.g., scenario_Stakes1_Certainty2)
        dimension_scores: dict[str, int] = {}
        for dim in dimensions:
            for level in dim.levels:
                if f"{dim.name}{level.score}" in scenario_key:
                    dimension_scores[dim.name] = level.score
                    break

        scenarios.append(GeneratedScenario(
            name=scenario_data.get("subject", scenario_key),
            preamble=preamble,
            prompt=body,
            dimensions=dimension_scores,
        ))

    return scenarios


def validate_input(data: dict[str, Any]) -> None:
    """Validate worker input."""
    required = ["definitionId", "modelId", "content"]
    for field_name in required:
        if field_name not in data:
            raise ValidationError(
                message=f"Missing required field: {field_name}",
                details=f"Input must include: {', '.join(required)}",
            )

    content = data["content"]
    if not isinstance(content, dict):
        raise ValidationError(message="content must be an object")

    if "template" not in content:
        raise ValidationError(message="content.template is required")


def calculate_expected_scenarios(dimensions: list[Dimension]) -> int:
    """Calculate the expected number of scenarios from dimension combinations."""
    if not dimensions:
        return 0
    return reduce(lambda x, y: x * len(y.levels), dimensions, 1)


def run_generation(data: dict[str, Any]) -> dict[str, Any]:
    """Execute the scenario generation."""
    definition_id = data["definitionId"]
    model_id = data["modelId"]
    content = data["content"]
    config = data.get("config", {})
    model_config = data.get("modelConfig")

    temperature = config.get("temperature", 0.7)
    max_tokens = config.get("maxTokens", 8192)

    preamble = content.get("preamble")
    template = content.get("template", "")
    raw_dimensions = content.get("dimensions", [])
    matching_rules = content.get("matching_rules")

    log.info(
        "Starting scenario generation",
        definitionId=definition_id,
        modelId=model_id,
        dimensionCount=len(raw_dimensions),
    )

    # Parse dimensions
    dimensions = parse_dimensions(raw_dimensions)

    # Calculate expected scenario count
    expected_count = calculate_expected_scenarios(dimensions)

    # Emit initial progress
    emit_progress(
        phase="starting",
        expected_scenarios=expected_count,
        message=f"Starting generation with {len(dimensions)} dimensions",
    )

    # If no dimensions with values, return empty - let TypeScript handle default scenario
    if not dimensions:
        log.info("No dimensions with values, returning empty", definitionId=definition_id)
        emit_progress(phase="completed", message="No dimensions, using default scenario")
        return {
            "success": True,
            "scenarios": [],
            "metadata": GenerationMetadata().to_dict(),
        }

    # Build prompt
    prompt = build_generation_prompt(preamble, template, dimensions, matching_rules)
    log.debug("Built generation prompt", definitionId=definition_id, promptLength=len(prompt))

    # Emit progress before LLM call
    emit_progress(
        phase="calling_llm",
        expected_scenarios=expected_count,
        message=f"Calling {model_id} to generate {expected_count} scenarios...",
    )

    try:
        # Call LLM using the shared adapter
        messages = [{"role": "user", "content": prompt}]
        response = generate(
            model_id,
            messages,
            temperature=temperature,
            max_tokens=max_tokens,
            model_config=model_config,
        )

        log.info(
            "LLM response received",
            definitionId=definition_id,
            responseLength=len(response.content),
            inputTokens=response.input_tokens,
            outputTokens=response.output_tokens,
        )

        # Emit progress after LLM call
        emit_progress(
            phase="parsing",
            expected_scenarios=expected_count,
            input_tokens=response.input_tokens or 0,
            output_tokens=response.output_tokens or 0,
            message=f"Received {response.output_tokens or 0} tokens, parsing scenarios...",
        )

        # Extract and parse YAML
        yaml_content = extract_yaml(response.content)
        log.debug("Extracted YAML", definitionId=definition_id, yamlLength=len(yaml_content))

        # Parse scenarios
        scenarios = parse_generated_scenarios(
            yaml_content,
            dimensions,
            normalize_preamble(preamble),
        )

        log.info(
            "Scenarios generated",
            definitionId=definition_id,
            scenarioCount=len(scenarios),
        )

        # Emit final progress
        emit_progress(
            phase="completed",
            expected_scenarios=expected_count,
            generated_scenarios=len(scenarios),
            input_tokens=response.input_tokens or 0,
            output_tokens=response.output_tokens or 0,
            message=f"Generated {len(scenarios)} scenarios",
        )

        return {
            "success": True,
            "scenarios": [s.to_dict() for s in scenarios],
            "metadata": GenerationMetadata(
                input_tokens=response.input_tokens or 0,
                output_tokens=response.output_tokens or 0,
                model_version=response.model_version,
            ).to_dict(),
        }

    except (WorkerError, LLMError) as err:
        log.error("Generation failed", definitionId=definition_id, err=err)
        emit_progress(
            phase="failed",
            expected_scenarios=expected_count,
            message=f"Generation failed: {err.message}",
        )
        return {
            "success": False,
            "error": err.to_dict(),
        }
    except Exception as err:
        worker_err = classify_exception(err)
        log.error("Generation failed with unexpected error", definitionId=definition_id, err=err)
        emit_progress(
            phase="failed",
            expected_scenarios=expected_count,
            message=f"Generation failed: {str(err)}",
        )
        return {
            "success": False,
            "error": worker_err.to_dict(),
        }


def main() -> None:
    """Main entry point - read from stdin, write to stdout."""
    try:
        # Read JSON input from stdin
        input_data = sys.stdin.read()
        if not input_data.strip():
            result = {
                "success": False,
                "error": {
                    "message": "No input provided",
                    "code": ErrorCode.VALIDATION_ERROR.value,
                    "retryable": False,
                },
            }
            print(json.dumps(result))
            return

        try:
            data = json.loads(input_data)
        except json.JSONDecodeError as err:
            result = {
                "success": False,
                "error": {
                    "message": f"Invalid JSON input: {err}",
                    "code": ErrorCode.VALIDATION_ERROR.value,
                    "retryable": False,
                },
            }
            print(json.dumps(result))
            return

        # Validate input
        try:
            validate_input(data)
        except ValidationError as err:
            result = {
                "success": False,
                "error": err.to_dict(),
            }
            print(json.dumps(result))
            return

        # Run generation
        result = run_generation(data)

        # Output result
        print(json.dumps(result))

    except Exception as err:
        log.error("Unexpected error in generate_scenarios worker", err=err)
        result = {
            "success": False,
            "error": {
                "message": str(err),
                "code": ErrorCode.UNKNOWN.value,
                "retryable": True,
                "details": type(err).__name__,
            },
        }
        print(json.dumps(result))


if __name__ == "__main__":
    main()
