# Changelog

All notable changes to the **Python Dependencies Manager** extension will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/).

## [1.1.0](https://github.com/davisilvarafacho/python-dependencies-manager/compare/v1.0.0...v1.1.0) (2026-07-20)


### Features

* auto-prompt for uv sync and pip install ([3adfdbd](https://github.com/davisilvarafacho/python-dependencies-manager/commit/3adfdbd164aeeadb2f02780af00234b283ecba17))
* **packageManager:** detect uv + shouldUseUv ([77d7bba](https://github.com/davisilvarafacho/python-dependencies-manager/commit/77d7bba5466013c820dac9ff7a8d6c35b792732a))
* **packageManager:** PipManager adapter over pipService ([7cb5d8a](https://github.com/davisilvarafacho/python-dependencies-manager/commit/7cb5d8aa8d10fbba712c0b6363a137637ba52d65))
* **packageManager:** resolvePackageManager factory ([b0d88ae](https://github.com/davisilvarafacho/python-dependencies-manager/commit/b0d88ae4d6491e39297b7729ab144ecb764c7fba))
* **packageManager:** UvManager with native uv CLI ([457165b](https://github.com/davisilvarafacho/python-dependencies-manager/commit/457165b381ac171a0605e1d76320ab98f58d7deb))
* packageOps template for sync/add flows ([2f9b4f1](https://github.com/davisilvarafacho/python-dependencies-manager/commit/2f9b4f11817104017b0acf0a48add5df01755308))
* **paths:** add pyproject.toml helpers ([1173321](https://github.com/davisilvarafacho/python-dependencies-manager/commit/11733216e07d4af48d965b4d720603ed677ca808))
* wire uv/pip backends into extension and package.json ([e4dae83](https://github.com/davisilvarafacho/python-dependencies-manager/commit/e4dae8355ebd4bbea813830c17d2e3dcebd59018))


### Bug Fixes

* **chore:** publisher id ([3e547b7](https://github.com/davisilvarafacho/python-dependencies-manager/commit/3e547b76691e0bf69170730ee319cbae43dadcc5))
* pin uv list to .venv, clear ENOENT, wrap installFlow ([e6656cf](https://github.com/davisilvarafacho/python-dependencies-manager/commit/e6656cf1d9938dd5306ecbc5c2c4e6e12748ce7c))
* refresh isUv context and avoid done log on sync failure ([b5b7563](https://github.com/davisilvarafacho/python-dependencies-manager/commit/b5b756368233cf6398406f27ef25759a3083b253))

## [Unreleased]

### Added

- Native **uv** backend when `uv` is on PATH and `pyproject.toml` exists (`sync` / `add` / `remove` / `venv`)
- Command **Sync dependencies** (shown in uv mode; pip projects keep **Install from requirements.txt**)
- Dual backend auto-detect: `uv` on PATH + root `pyproject.toml` → UvManager; otherwise PipManager
- Package list under uv uses `uv pip list --format=json` only for listing (native uv for all other ops)

### Planned (post-1.1)

- Monorepo / multi-root workspaces
- Poetry / conda backends
- Fine-grained bidirectional requirements sync (beyond full `pip freeze`)
- Update-all packages
- Optional richer UI polish
- Setting to force uv/pip backend

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
