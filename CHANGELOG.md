# Changelog

All notable changes to the **Python Dependencies Manager** extension will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Planned (post-1.0)

- Monorepo / multi-root workspaces
- Poetry / uv / conda backends
- Fine-grained bidirectional requirements sync (beyond full `pip freeze`)
- Update-all packages
- Optional richer UI polish

## [1.0.0] - 2026-07-16

First stable release of the project `.venv` dependency manager for VS Code.

### Added

- Detect `requirements.txt` at workspace root and suggest install **only when `.venv` is missing**
- Create `.venv` with the interpreter from the Python extension (`ms-python.python`)
- Bootstrap `pip` via `ensurepip` when the venv has no pip module
- `pip install -r requirements.txt` with progress notifications and Output Channel logs
- Activity Bar **Packages** webview:
  - Fixed **filter** for installed packages only
  - Update / Remove actions per package
  - Toolbar: Refresh, Install Package, Install from requirements.txt
- **Install Package** QuickPick (PyPI):
  - Prefix search (e.g. `django-`) with ≥50 results via PEP 691 JSON simple index
  - Latest version on the right, package summary
  - Multi-select to install several packages in one `pip install`
  - Hides packages already installed in the venv
  - Disk/memory cache of the PyPI name index
- After install: optional **`pip freeze` → `requirements.txt`**
- Prompt preferences: Not now (session) and Don’t ask again (workspace)
- Structured logs (`flow`, `venv`, `pip`, `process`, `pypi`, …)
- Multilingual READMEs: pt-BR, English, Español, Français
- Design/spec and manual smoke checklist under `docs/superpowers/`
- Sample project under `fixtures/sample-project/`

### Fixed

- F5 preLaunchTask hangs (compile instead of watch)
- Extension activation on view/commands
- Python interpreter resolution via `resolveEnvironment`
- Cloudflare / “Parse Error: JS Exception” on HTML simple index (switched to JSON API)
- Stream abort race on earlier HTML scraper

## [0.0.1] - 2026-07-16

### Added

- Extension scaffold (webpack, TypeScript, tests)
- Product design spec and project metadata
