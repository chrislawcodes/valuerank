#!/usr/bin/env python3
"""
Probe Worker - Executes multi-turn LLM conversations for scenario evaluation.

Protocol:
- Reads JSON input from stdin
- Writes JSON output to stdout
- Logs structured JSON to stderr

Input format (ProbeWorkerInput):
{
  "runId": string,
  "scenarioId": string,
  "modelId": string,
  "scenario": {
    "preamble": string,
    "prompt": string,
    "followups": [{ "label": string, "prompt": string }]
  },
  "config": {
    "temperature": number,
    "maxTokens": number,
    "maxTurns": number
  }
}

Output format (ProbeWorkerOutput):
Success:
{
  "success": true,
  "transcript": {
    "turns": [...],
    "totalInputTokens": number,
    "totalOutputTokens": number,
    "modelVersion": string | null,
    "startedAt": string,
    "completedAt": string
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
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

# Estimated tokens per character for non-OpenAI models
CHARS_PER_TOKEN = 4

# Try to import tiktoken for accurate OpenAI token counting
try:
    import tiktoken
    TIKTOKEN_AVAILABLE = True
except ImportError:
    TIKTOKEN_AVAILABLE = False

from common.errors import ErrorCode, LLMError, ValidationError, WorkerError, classify_exception
from common.llm_adapters import LLMResponse, generate, infer_provider
from common.logging import get_logger

log = get_logger("probe")


@dataclass
class Turn:
    """A single turn in the conversation."""

    turn_number: int
    prompt_label: str
    probe_prompt: str
    target_response: str
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON output."""
        return {
            "turnNumber": self.turn_number,
            "promptLabel": self.prompt_label,
            "probePrompt": self.probe_prompt,
            "targetResponse": self.target_response,
            "inputTokens": self.input_tokens,
            "outputTokens": self.output_tokens,
        }


@dataclass
class Transcript:
    """Complete transcript of a probe conversation."""

    turns: list[Turn] = field(default_factory=list)
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    model_version: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON output."""
        return {
            "turns": [t.to_dict() for t in self.turns],
            "totalInputTokens": self.total_input_tokens,
            "totalOutputTokens": self.total_output_tokens,
            "modelVersion": self.model_version,
            "startedAt": self.started_at.isoformat() if self.started_at else None,
            "completedAt": self.completed_at.isoformat() if self.completed_at else None,
        }


def estimate_tokens(text: str, model: str) -> int:
    """
    Estimate token count for text.

    Uses tiktoken for OpenAI models (accurate), character estimation for others.
    """
    if not text:
        return 0

    provider = infer_provider(model)

    if provider == "openai" and TIKTOKEN_AVAILABLE:
        try:
            # Try to get encoding for specific model
            encoding = tiktoken.encoding_for_model(model)
        except KeyError:
            # Fall back to cl100k_base for GPT-4 class models
            encoding = tiktoken.get_encoding("cl100k_base")
        return len(encoding.encode(text))

    # Estimate for non-OpenAI models
    return max(1, len(text) // CHARS_PER_TOKEN)


def validate_input(data: dict[str, Any]) -> None:
    """Validate probe worker input."""
    required = ["runId", "scenarioId", "modelId", "scenario", "config"]
    for field_name in required:
        if field_name not in data:
            raise ValidationError(
                message=f"Missing required field: {field_name}",
                details=f"Input must include: {', '.join(required)}",
            )

    scenario = data["scenario"]
    if not isinstance(scenario, dict):
        raise ValidationError(message="scenario must be an object")

    if "prompt" not in scenario:
        raise ValidationError(message="scenario.prompt is required")

    if not scenario.get("prompt", "").strip():
        raise ValidationError(message="scenario.prompt cannot be empty")


def run_probe(data: dict[str, Any]) -> dict[str, Any]:
    """
    Execute the probe conversation.

    Args:
        data: Validated probe worker input

    Returns:
        Success response with transcript or error response
    """
    run_id = data["runId"]
    scenario_id = data["scenarioId"]
    model_id = data["modelId"]
    scenario = data["scenario"]
    config = data.get("config", {})

    temperature = config.get("temperature", 0.7)
    max_tokens = config.get("maxTokens", 1024)
    max_turns = config.get("maxTurns", 10)

    log.info(
        "Starting probe",
        runId=run_id,
        scenarioId=scenario_id,
        modelId=model_id,
    )

    transcript = Transcript(started_at=datetime.now(timezone.utc))

    # Build initial conversation with preamble and prompt
    messages: list[dict[str, str]] = []

    preamble = scenario.get("preamble", "")
    if preamble:
        messages.append({"role": "system", "content": preamble})

    prompt = scenario["prompt"]
    messages.append({"role": "user", "content": prompt})

    try:
        # Turn 1: Initial prompt
        log.debug("Executing turn 1", modelId=model_id)
        response = generate(
            model_id,
            messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        turn = Turn(
            turn_number=1,
            prompt_label="scenario_prompt",
            probe_prompt=prompt,
            target_response=response.content,
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
        )
        transcript.turns.append(turn)

        if response.input_tokens:
            transcript.total_input_tokens += response.input_tokens
        if response.output_tokens:
            transcript.total_output_tokens += response.output_tokens
        if response.model_version:
            transcript.model_version = response.model_version

        # Add assistant response to conversation
        messages.append({"role": "assistant", "content": response.content})

        # Execute followup turns
        followups = scenario.get("followups", [])
        for i, followup in enumerate(followups[:max_turns - 1]):
            turn_num = i + 2
            followup_label = followup.get("label", f"followup_{i + 1}")
            followup_prompt = followup.get("prompt", "")

            if not followup_prompt:
                continue

            log.debug("Executing followup turn", turn=turn_num, label=followup_label)

            # Add followup to conversation
            messages.append({"role": "user", "content": followup_prompt})

            response = generate(
                model_id,
                messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )

            turn = Turn(
                turn_number=turn_num,
                prompt_label=followup_label,
                probe_prompt=followup_prompt,
                target_response=response.content,
                input_tokens=response.input_tokens,
                output_tokens=response.output_tokens,
            )
            transcript.turns.append(turn)

            if response.input_tokens:
                transcript.total_input_tokens += response.input_tokens
            if response.output_tokens:
                transcript.total_output_tokens += response.output_tokens
            if response.model_version and not transcript.model_version:
                transcript.model_version = response.model_version

            # Add response to conversation
            messages.append({"role": "assistant", "content": response.content})

        transcript.completed_at = datetime.now(timezone.utc)

        log.info(
            "Probe completed",
            runId=run_id,
            scenarioId=scenario_id,
            modelId=model_id,
            turns=len(transcript.turns),
            inputTokens=transcript.total_input_tokens,
            outputTokens=transcript.total_output_tokens,
        )

        return {
            "success": True,
            "transcript": transcript.to_dict(),
        }

    except (WorkerError, LLMError) as err:
        log.error("Probe failed", runId=run_id, err=err)
        return {
            "success": False,
            "error": err.to_dict(),
        }
    except Exception as err:
        # Classify unknown exceptions
        worker_err = classify_exception(err)
        log.error("Probe failed with unexpected error", runId=run_id, err=err)
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

        # Run probe
        result = run_probe(data)

        # Output result
        print(json.dumps(result))

    except Exception as err:
        # Catch-all for unexpected errors
        log.error("Unexpected error in probe worker", err=err)
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
