# Python Dependencies Manager

**Languages:** [Português (Brasil)](README.md) · [English](README.en.md) · [Español](README.es.md) · [Français](README.fr.md)

A VS Code extension that manages **project `.venv`** Python dependencies, in the spirit of PyCharm’s package manager. It uses **two auto-detected backends**:

- **uv** (native) — when `uv` is on `PATH` **and** `pyproject.toml` exists at the workspace root  
- **pip** — otherwise (`requirements.txt` + `python -m venv` / `pip`)

**Status:** **v1.0.0** — stable release (+ uv backend in progress). Manual checklist: [docs/superpowers/plans/manual-checklist.md](docs/superpowers/plans/manual-checklist.md).

## Features

1. **Auto-detects the backend**: `uv` on PATH + `pyproject.toml` → native uv; else → pip  
2. **Detects** `requirements.txt` or `pyproject.toml` at the root of the opened folder  
3. **Notifies** and suggests installing/syncing dependencies **only if `.venv` does not already exist**  
4. If **`.venv`** is missing, **creates** it (pip: interpreter from the [Python extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python); uv: `uv venv`)  
5. Syncs the manifest: **`pip install -r requirements.txt`** or **`uv sync`**  
6. Shows packages in the **Activity Bar** (webview with search)  
7. **Install / uninstall / update** individual packages (`pip install` / `uv add`, etc.)  
8. After installing with **pip**, asks whether to **update `requirements.txt` with `pip freeze`** (with **uv**, `uv add` already edits `pyproject.toml` — no freeze dialog)  
9. Detailed logs in the **Python Dependencies Manager** output channel  

### uv backend (details)

When uv mode is active, the extension uses the **native** uv CLI:

| Operation | Command |
|-----------|---------|
| Create environment | `uv venv` |
| Sync dependencies | `uv sync` |
| Add package | `uv add` |
| Remove package | `uv remove` |
| Update package | `uv lock --upgrade-package` + `uv sync` |
| List packages | `uv pip list --format=json` (**only** exception: listing uses `uv pip`) |

## Prerequisites

- [Visual Studio Code](https://code.visualstudio.com/) (or a compatible fork)  
- **[Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python)** extension installed  
- A Python interpreter selected (`Python: Select Interpreter`)  
- The **venv** module available for the pip flow (Debian/Ubuntu: `sudo apt install python3-venv` or `python3.12-venv`)  
- Project opened as a **single folder** (root with `requirements.txt` / `pyproject.toml` / `.venv`)  
- **Optional — uv:** [uv](https://github.com/astral-sh/uv) on `PATH` for projects with `pyproject.toml` (without uv, the pip backend is used)

## How to use

### Automatic flow (new project)

1. Open the project folder with `requirements.txt` or `pyproject.toml` at the root **and no `.venv`**  
2. A notification offers to install/sync  
3. Choose:  
   - **Install** / **Sync** — creates `.venv` if needed and installs dependencies  
   - **Not now** — do not ask again this session  
   - **Don’t ask again** — do not ask again in this workspace  

If **`.venv` already exists**, the notification is **not** shown. The manual command remains available.

### Packages view (installed)

Activity Bar → **Python Dependencies**:

- **Fixed filter** at the top: filters **only packages already installed** in `.venv`
- **Update** / **Remove** on each row
- Toolbar: **Refresh**, **Install Package** (+), and the active backend’s sync command

### Install packages (+ button / PyPI QuickPick)

Opened via **+ Install Package** (toolbar or Command Palette) — **separate** from the list filter:

- **PyPI** search (e.g. `django-` → ≥50 results)
- **Latest version on the right**, summary below
- **Multi-select** several packages → Enter installs them all at once
- Free-form text (`name==1.0`, git, etc.)
- Afterwards (pip only): option to run **`pip freeze` → `requirements.txt`**

### Command Palette

Category **Python Dependencies**:

| Command | Description | When shown |
|---------|-------------|------------|
| `Install from requirements.txt` | Full pip flow (`pip install -r`) | Projects **not** in uv mode |
| `Sync dependencies` | uv flow (`uv venv` + `uv sync`) | `uv` on PATH + `pyproject.toml` |
| `Refresh Packages` | Reloads the `.venv` list | Always |
| `Install Package` | Multi-select PyPI search + install/add | Always |

## Feedback and logs

- **Progress** notifications while venv/pip/uv run  
- **View → Output → Python Dependencies Manager** (timestamped logs by scope: `flow`, `venv`, `pip`, `uv`, `process`, etc.)

## Current scope (and out of scope)

**In scope:** single folder; **pip** (`requirements.txt`) and **native uv** (`pyproject.toml` + uv on PATH) backends; PyPI search; optional freeze on pip.

**Out of scope (for now):** monorepo, Poetry/conda, fine-grained manifest sync, “update all”, forced backend setting, uv workspace extras/dev-group UI.

MVP design: [`docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md`](docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md).  
uv design: [`docs/superpowers/specs/2026-07-17-uv-native-package-manager-design.md`](docs/superpowers/specs/2026-07-17-uv-native-package-manager-design.md).

## Development

```bash
pnpm install
pnpm run compile
# or: pnpm run watch
```

In VS Code: **F5** (Run Extension).

Sample project: `fixtures/sample-project/` (includes `requirements.txt`).

```bash
pnpm run lint
pnpm test
```

### Testing with F5

1. Open **this repository** in VS Code  
2. `pnpm install` && `pnpm run compile`  
3. **F5** → **Extension Development Host** window  
4. **File → Open Folder** → `fixtures/sample-project` (not the extension repo root)  
5. **Python** extension + **Select Interpreter**  
6. Notification (if there is no `.venv`) or **Install from requirements.txt** / **Sync dependencies**  
7. Activity Bar → **Python Dependencies**  
8. Output → **Python Dependencies Manager**

### Troubleshooting

| Symptom | Common cause | What to do |
|---------|--------------|------------|
| F5 stuck on preLaunchTask | `watch` task | F5 uses `npm: compile` |
| Empty view | extension not activated | Open a folder with `requirements.txt`/`pyproject.toml`/`.venv` or run a command |
| venv / ensurepip error | missing `python3-venv` | `sudo apt install python3.12-venv` |
| No interpreter | Python extension | Install **Python** and select an interpreter |
| pyproject project still uses pip | `uv` not on PATH | Install uv or accept the pip backend |
| ConfigCat warnings in log | VS Code / GitHub | Ignore — not from this extension |

Package:

```bash
pnpm run package
# npx @vscode/vsce package
```

## Structure (high level)

```
src/
  extension.ts              # activate, commands, auto-prompt
  packageOps.ts             # Template Method (progress, errors, refresh)
  packageManager/           # Strategy: detect, resolve, PipManager, UvManager
  packagesWebview.ts        # view + PyPI search / installed list
  packageInstallQuickPick.ts
  pypiClient.ts             # simple index + PyPI JSON
  pipService.ts / venvService.ts / preferences.ts / ...
docs/superpowers/specs/     # design
docs/superpowers/plans/     # plan + checklist
media/                      # Activity Bar icon
fixtures/sample-project/    # test project
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT (`license` field in `package.json`).
