# Changelog

All notable changes to the **Python Dependencies Manager** extension will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Implemented (MVP)

- Detect `requirements.txt` at workspace root and suggest install via notification
- Create `.venv` when missing (using the Python extension interpreter)
- `pip install -r requirements.txt` with progress + Output Channel
- Activity Bar TreeView listing packages in `.venv`
- Install / uninstall / update single packages via pip
- Commands: Install from requirements, Refresh, Install package
- Prompt preferences: Not now (session) and Don’t ask again (workspace)

### Planned (post-MVP)

- Monorepo / multi-root, Poetry/uv/conda, bidirectional requirements sync, update-all, richer Webview UI

## [0.0.1] - 2026-07-16

### Added

- Extension scaffold (webpack, TypeScript, tests)
- Product design spec and project metadata (README, package.json contributes)
