#!/usr/bin/env python3
"""
Health Check Worker - Verifies Python environment and dependencies.

Protocol:
- Reads JSON input from stdin (optional, can be empty)
- Writes JSON output to stdout
- Logs structured JSON to stderr

Output format:
Success:
{
  "success": true,
  "health": {
    "pythonVersion": string,
    "packages": { "package": "version", ... },
    "apiKeys": { "provider": boolean, ... },
    "warnings": [string, ...]
  }
}

Error:
{
  "success": false,
  "error": {
    "message": string,
    "code": string,
    "retryable": boolean
  }
}
"""

import json
import sys
from typing import Any

from common.config import get_config
from common.errors import ErrorCode
from common.logging import get_logger

log = get_logger("health_check")

# Required packages
REQUIRED_PACKAGES = ["requests", "pyyaml"]

# Optional packages
OPTIONAL_PACKAGES = ["tiktoken"]


def get_python_version() -> str:
    """Get Python version string."""
    return f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"


def check_python_version() -> tuple[bool, str]:
    """Check Python version meets minimum requirement (3.10+)."""
    major = sys.version_info.major
    minor = sys.version_info.minor

    if major < 3 or (major == 3 and minor < 10):
        return False, f"Python 3.10+ required, found {major}.{minor}"

    return True, f"Python {major}.{minor}"


def get_package_version(package: str) -> str | None:
    """Get installed version of a package."""
    try:
        from importlib.metadata import version

        return version(package)
    except Exception:
        return None


def check_packages() -> tuple[dict[str, str], list[str]]:
    """Check required packages are installed."""
    packages: dict[str, str] = {}
    warnings: list[str] = []

    for package in REQUIRED_PACKAGES:
        version = get_package_version(package)
        if version:
            packages[package] = version
        else:
            warnings.append(f"Required package '{package}' not installed")

    for package in OPTIONAL_PACKAGES:
        version = get_package_version(package)
        if version:
            packages[package] = version

    return packages, warnings


def check_api_keys() -> tuple[dict[str, bool], list[str]]:
    """Check which API keys are configured."""
    config = get_config()
    api_keys: dict[str, bool] = {}
    warnings: list[str] = []

    providers = ["openai", "anthropic", "google", "xai", "deepseek", "mistral"]

    for provider in providers:
        has_key = config.has_api_key(provider)
        api_keys[provider] = has_key

    # Warn if no API keys are configured
    if not any(api_keys.values()):
        warnings.append("No LLM API keys configured - probe jobs will fail")

    return api_keys, warnings


def run_health_check() -> dict[str, Any]:
    """Run health check and return result."""
    log.info("Running health check")

    warnings: list[str] = []

    # Check Python version
    version_ok, version_str = check_python_version()
    if not version_ok:
        return {
            "success": False,
            "error": {
                "message": version_str,
                "code": ErrorCode.VALIDATION_ERROR.value,
                "retryable": False,
            },
        }

    # Check packages
    packages, package_warnings = check_packages()
    warnings.extend(package_warnings)

    # Check API keys
    api_keys, api_key_warnings = check_api_keys()
    warnings.extend(api_key_warnings)

    # Log warnings
    for warning in warnings:
        log.warn(warning)

    log.info(
        "Health check complete",
        pythonVersion=get_python_version(),
        packageCount=len(packages),
        apiKeyCount=sum(1 for v in api_keys.values() if v),
        warningCount=len(warnings),
    )

    return {
        "success": True,
        "health": {
            "pythonVersion": get_python_version(),
            "packages": packages,
            "apiKeys": api_keys,
            "warnings": warnings,
        },
    }


def main() -> None:
    """Main entry point."""
    try:
        # Read stdin (optional input)
        _ = sys.stdin.read()

        # Run health check
        result = run_health_check()

        # Output result
        print(json.dumps(result))

    except Exception as err:
        log.error("Health check failed", err=err)
        result = {
            "success": False,
            "error": {
                "message": str(err),
                "code": ErrorCode.UNKNOWN.value,
                "retryable": True,
            },
        }
        print(json.dumps(result))


if __name__ == "__main__":
    main()
