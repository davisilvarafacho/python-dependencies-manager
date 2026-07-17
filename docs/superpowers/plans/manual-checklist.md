# Manual smoke checklist (F5 Extension Development Host)

Run in VS Code with this extension open, then **F5**. Interactive UI cannot be fully automated in CI; check each item by hand.

## Setup (pip)

- [ ] Temp folder with root `requirements.txt` (e.g. `six==1.16.0`)
- [ ] Python extension installed; interpreter selected (`Python: Select Interpreter`)
- [ ] Command Palette shows **Install from requirements.txt** (not **Sync dependencies**)

## Auto-prompt + install from requirements (pip)

- [ ] On open with root `requirements.txt` and no `.venv`, notification offers **Install** / **Not now** / **Don’t ask again**
- [ ] **Install** → `.venv` created if missing, packages installed, **Python Dependencies Manager** Output Channel has logs
- [ ] Activity Bar **Python Dependencies** lists installed packages (e.g. `six`)

## Prompt preferences

- [ ] Reload Extension Development Host; choose **Not now** → no second prompt in the same session
- [ ] Reload window; choose **Don’t ask again** → no auto-prompt on subsequent opens of that workspace
- [ ] Command Palette → **Python Dependencies: Install from requirements.txt** still runs install after “Don’t ask again”

## TreeView / webview CRUD (pip)

- [ ] **Install Package** (view title or Command Palette) → e.g. `wheel` → appears after refresh
- [ ] After install, optional **pip freeze → requirements.txt** dialog is offered
- [ ] **Update** on a package item → pip upgrade runs; Output Channel shows log
- [ ] **Uninstall** on a package item → package removed from list after refresh
- [ ] **Refresh Packages** reloads the list

## Errors (pip)

- [ ] Missing / no selected interpreter → clear error (select interpreter); does not only dump a raw stack
- [ ] Optional: no `.venv` + Install package alone → sensible error / hint to install from requirements

---

## Setup (uv)

- [ ] [uv](https://github.com/astral-sh/uv) installed and on `PATH` (`uv --version`)
- [ ] Temp folder with root `pyproject.toml` (minimal project, e.g. `[project]` name/version + empty or small deps) **without** forcing pip-only layout
- [ ] Python extension installed; interpreter selected
- [ ] Command Palette shows **Sync dependencies** (not **Install from requirements.txt**)

## Auto-prompt + sync (uv)

- [ ] On open with root `pyproject.toml`, uv on PATH, and no `.venv`, notification offers **Sync** (or primary sync label) / **Not now** / **Don’t ask again**
- [ ] **Sync** → `.venv` created via `uv venv` if missing, `uv sync` runs, Output Channel logs uv steps
- [ ] Activity Bar **Python Dependencies** lists packages from the environment

## uv CRUD

- [ ] **Install Package** (+) → e.g. add a small package → `uv add` updates `pyproject.toml`; package appears after refresh
- [ ] **No** freeze / requirements.txt dialog after install (uv mode)
- [ ] **Update** on a package → `uv lock --upgrade-package` + `uv sync` (check Output Channel)
- [ ] **Uninstall** / Remove → `uv remove`; package gone after refresh; `pyproject.toml` updated
- [ ] **Refresh Packages** reloads the list (under the hood: `uv pip list --format=json` for listing only)

## Backend detection edge cases

- [ ] Folder with **only** `requirements.txt` (uv may be on PATH) → pip backend; **Install from requirements.txt** visible
- [ ] Folder with `pyproject.toml` but **uv not** on PATH → pip backend; no crash; no silent uv calls
- [ ] Folder with `pyproject.toml` + uv on PATH → uv backend; **Sync dependencies** visible
- [ ] If `.venv` already exists → no auto-prompt (pip or uv); manual sync/install still available

## Errors (uv)

- [ ] uv removed from PATH mid-session (optional) → clear “uv not found” style error on next op
- [ ] Optional: no `.venv` + Install package alone → error / hint using **Sync dependencies** title

## Out of scope (by design)

- Monorepo, Poetry/conda, update-all, bidirectional line-level requirements sync, force-backend setting — not tested here
