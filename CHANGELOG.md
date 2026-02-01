# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed
- **Preamble Removal**: Removed the optional "Preamble" field from Definition scenarios and the `RATING_INSTRUCTION` system prompt injection in the probe worker. This simplifies the prompt structure sent to models.
- **Probe Worker**: Updated `probe.py` to use `scenario.prompt` directly without prepending instructions.
- **UI**: Removed "Preamble" section from `DefinitionEditor`.
