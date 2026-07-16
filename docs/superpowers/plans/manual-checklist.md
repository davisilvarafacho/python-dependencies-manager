# Manual smoke checklist (F5 Extension Development Host)

Run in VS Code with this extension open, then **F5**. Interactive UI cannot be fully automated in CI; check each item by hand.

## Setup

- [ ] Temp folder with root `requirements.txt` (e.g. `six==1.16.0`)
- [ ] Python extension installed; interpreter selected (`Python: Select Interpreter`)

## Auto-prompt + install from requirements

- [ ] On open with root `requirements.txt`, notification offers **Install** / **Not now** / **Don’t ask again**
- [ ] **Install** → `.venv` created if missing, packages installed, **Python Dependencies Manager** Output Channel has logs
- [ ] Activity Bar **Python Dependencies** TreeView lists installed packages (e.g. `six`)

## Prompt preferences

- [ ] Reload Extension Development Host; choose **Not now** → no second prompt in the same session
- [ ] Reload window; choose **Don’t ask again** → no auto-prompt on subsequent opens of that workspace
- [ ] Command Palette → **Python Dependencies: Install from requirements.txt** still runs install after “Don’t ask again”

## TreeView CRUD

- [ ] **Install Package** (view title or Command Palette) → e.g. `wheel` → appears after refresh
- [ ] **Update** on a package item → pip upgrade runs; Output Channel shows log
- [ ] **Uninstall** on a package item → package removed from list after refresh
- [ ] **Refresh Packages** reloads the list

## Errors

- [ ] Missing / no selected interpreter → clear error (select interpreter); does not only dump a raw stack
- [ ] Optional: no `.venv` + Install package alone → sensible error / hint to install from requirements

## Out of scope (by design)

- Monorepo, Poetry/uv/conda, update-all, bidirectional requirements sync — not tested here
