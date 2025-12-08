"""
Structured JSON logging for Python workers.

All logs go to stderr (stdout is reserved for JSON output).
Matches the structured logging format expected by the TypeScript orchestrator.
"""

import json
import sys
import time
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class Logger:
    """Structured JSON logger that outputs to stderr."""

    context: str
    _extra: dict = field(default_factory=dict)

    def child(self, **extra: Any) -> "Logger":
        """Create a child logger with additional context."""
        new_extra = {**self._extra, **extra}
        return Logger(context=self.context, _extra=new_extra)

    def _log(self, level: str, message: str, **kwargs: Any) -> None:
        """Output a structured log entry to stderr."""
        entry = {
            "level": level,
            "time": int(time.time() * 1000),  # Unix timestamp in ms
            "context": self.context,
            "msg": message,
            **self._extra,
            **kwargs,
        }

        # Handle error objects specially
        if "err" in entry:
            err = entry["err"]
            if isinstance(err, Exception):
                entry["err"] = {
                    "type": type(err).__name__,
                    "message": str(err),
                }
            elif isinstance(err, dict):
                pass  # Already a dict
            else:
                entry["err"] = str(err)

        # Serialize to JSON and write to stderr
        try:
            json_str = json.dumps(entry, default=str)
            print(json_str, file=sys.stderr, flush=True)
        except Exception as e:
            # Fallback if JSON serialization fails
            fallback = {
                "level": "error",
                "time": int(time.time() * 1000),
                "context": self.context,
                "msg": f"Failed to serialize log entry: {e}",
                "original_message": message,
            }
            print(json.dumps(fallback), file=sys.stderr, flush=True)

    def trace(self, message: str, **kwargs: Any) -> None:
        """Log at trace level."""
        self._log("trace", message, **kwargs)

    def debug(self, message: str, **kwargs: Any) -> None:
        """Log at debug level."""
        self._log("debug", message, **kwargs)

    def info(self, message: str, **kwargs: Any) -> None:
        """Log at info level."""
        self._log("info", message, **kwargs)

    def warn(self, message: str, **kwargs: Any) -> None:
        """Log at warn level."""
        self._log("warn", message, **kwargs)

    def error(self, message: str, **kwargs: Any) -> None:
        """Log at error level."""
        self._log("error", message, **kwargs)


# Module-level logger cache
_loggers: dict[str, Logger] = {}


def get_logger(context: str) -> Logger:
    """
    Get or create a logger for the given context.

    Args:
        context: The context/module name for the logger

    Returns:
        A Logger instance for the given context

    Example:
        log = get_logger('probe')
        log.info('Starting probe', runId='abc123', modelId='gpt-4')
    """
    if context not in _loggers:
        _loggers[context] = Logger(context=context)
    return _loggers[context]
