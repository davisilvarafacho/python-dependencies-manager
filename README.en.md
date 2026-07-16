# Python Dependencies Manager

**Languages:** [Português (Brasil)](README.md) · [English](README.en.md) · [Español](README.es.md) · [Français](README.fr.md)

A VS Code extension that manages **project `.venv`** Python dependencies with **pip**, in the spirit of PyCharm’s package manager.

**Status:** MVP implemented. Manual checklist: [docs/superpowers/plans/manual-checklist.md](docs/superpowers/plans/manual-checklist.md).

## Features

1. **Detects** `requirements.txt` at the root of the opened folder  
2. **Notifies** and suggests installing dependencies **only if `.venv` does not already exist**  
3. If **`.venv`** is missing, **creates** it with the interpreter from the [Python extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python)  
4. Ensures **pip** is available in the environment (`ensurepip` if needed) and runs **`pip install -r requirements.txt`**  
5. Shows packages in the **Activity Bar** (webview with search)  
6. **Install / uninstall / update** individual packages  
7. After installing a package, asks whether to **update `requirements.txt` with `pip freeze`**  
8. Detailed logs in the **Python Dependencies Manager** output channel  

## Prerequisites

- [Visual Studio Code](https://code.visualstudio.com/) (or a compatible fork)  
- **[Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python)** extension installed  
- A Python interpreter selected (`Python: Select Interpreter`)  
- The **venv** module available (Debian/Ubuntu: `sudo apt install python3-venv` or `python3.12-venv`)  
- Project opened as a **single folder** (root with `requirements.txt` / `.venv`)

## How to use

### Automatic flow (new project)

1. Open the project folder with `requirements.txt` at the root **and no `.venv`**  
2. A notification offers to install  
3. Choose:  
   - **Install** — creates `.venv` if needed and installs dependencies  
   - **Not now** — do not ask again this session  
   - **Don’t ask again** — do not ask again in this workspace  

If **`.venv` already exists**, the notification is **not** shown. The manual command remains available.

### Packages view (installed)

Activity Bar → **Python Dependencies**:

- **Fixed filter** at the top: filters **only packages already installed** in `.venv`
- **Update** / **Remove** on each row
- Toolbar: **Refresh**, **Install Package** (+), **Install from requirements.txt**

### Install packages (+ button / PyPI QuickPick)

Opened via **+ Install Package** (toolbar or Command Palette) — **separate** from the list filter:

- **PyPI** search (e.g. `django-` → ≥50 results)
- **Latest version on the right**, summary below
- **Multi-select** several packages → Enter installs them all at once
- Free-form text (`name==1.0`, git, etc.)
- Afterwards: option to run **`pip freeze` → `requirements.txt`**

### Command Palette

Category **Python Dependencies**:

| Command | Description |
|---------|-------------|
| `Install from requirements.txt` | Full flow (always available) |
| `Refresh Packages` | Reloads the `.venv` list |
| `Install Package` | Multi-select PyPI search + `pip install` |

## Feedback and logs

- **Progress** notifications while venv/pip run  
- **View → Output → Python Dependencies Manager** (timestamped logs by scope: `flow`, `venv`, `pip`, `process`, etc.)

## Current scope (and out of scope)

**In the MVP:** single folder, `requirements.txt` + pip + `.venv` at root, PyPI search, optional freeze.

**Out of MVP (for now):** monorepo, Poetry/uv/conda, fine-grained manifest sync, “update all”.

Design: [`docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md`](docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md).

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
6. Notification (if there is no `.venv`) or **Install from requirements.txt**  
7. Activity Bar → **Python Dependencies**  
8. Output → **Python Dependencies Manager**

### Troubleshooting

| Symptom | Common cause | What to do |
|---------|--------------|------------|
| F5 stuck on preLaunchTask | `watch` task | F5 uses `npm: compile` |
| Empty view | extension not activated | Open a folder with `requirements.txt`/`.venv` or run a command |
| venv / ensurepip error | missing `python3-venv` | `sudo apt install python3.12-venv` |
| No interpreter | Python extension | Install **Python** and select an interpreter |
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
  installFlow.ts            # python → venv → pip install -r
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
