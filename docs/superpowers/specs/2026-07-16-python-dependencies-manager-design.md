# Python Dependencies Manager — Design Spec

**Date:** 2026-07-16  
**Status:** Approved  
**Scope:** MVP (onboarding + package CRUD via pip)

## Problem

VS Code does not offer a first-class, PyCharm-like flow for:

1. Detecting a project’s `requirements.txt`
2. Creating a local `.venv` when missing
3. Installing dependencies with pip
4. Listing and managing packages in that environment

Users who open a single Python folder expect a basic, guided path: detect → suggest install → create venv if needed → pip install → manage packages.

## Goals (MVP)

- Detect `requirements.txt` at the **workspace root**
- Show a notification offering to install dependencies
- Use **only pip** for all package operations
- Create `.venv` at the workspace root if it does not exist
- Use the interpreter selected by the **Python extension** (`ms-python.python`)
- Provide feedback via **progress notifications** and an **Output Channel**
- Show installed packages in an **Activity Bar TreeView**
- Support manual actions: install, uninstall, update (single package), refresh, and re-run “install from requirements.txt”

## Non-goals (MVP)

- Monorepo / multi-root / multiple `requirements.txt` locations
- Poetry, uv, conda, pipenv, or other tools
- Bidirectional sync with `requirements.txt` (e.g. freeze on uninstall)
- “Update all packages”
- Webview UI
- Creating or selecting interpreters outside the Python extension

## Assumptions

- User opens a **single folder** that contains the project (and typically `requirements.txt` at root)
- `.venv` and `requirements.txt` live at the **workspace root**
- The [Python extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python) is installed and an interpreter is selected
- Target OS for first implementation: Linux/macOS paths; Windows path differences handled where pip/venv commands differ

## Architecture

**Approach:** shell-first extension.

The extension does not embed a package resolver. It:

1. Resolves the active Python interpreter from `ms-python.python`
2. Runs subprocesses (`python -m venv`, `python -m pip …`)
3. Surfaces results in VS Code UI (notifications, progress, Output Channel, TreeView)

```
┌─────────────────────────────────────────────────────────┐
│  VS Code UI                                              │
│  - Notification (detect requirements.txt)                │
│  - Progress + Output Channel                             │
│  - Activity Bar TreeView (packages)                      │
│  - Commands (install/uninstall/update/refresh/from reqs) │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│  Extension core                                          │
│  - Activation / detection                                │
│  - Preference state (dontAskAgain, session notNow)       │
│  - Orchestrator (ensureVenv → pip install -r …)          │
│  - Package service (list/install/uninstall/update)       │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│  External                                                │
│  - ms-python.python (selected interpreter)               │
│  - python -m venv .venv                                  │
│  - .venv’s pip (install/list/uninstall/upgrade)          │
└─────────────────────────────────────────────────────────┘
```

## Components

| Component | Responsibility |
|-----------|----------------|
| `activation` | Register commands, TreeView, watchers; run detection on open |
| `requirementsDetector` | Check workspace root for `requirements.txt`; respect preferences |
| `pythonResolver` | Get selected interpreter from Python extension API/commands; fail clearly if missing |
| `venvService` | Create `.venv` if missing using selected interpreter |
| `pipService` | Run pip list/install/uninstall/upgrade; parse JSON where possible |
| `output` | Dedicated Output Channel for all command logs |
| `packagesTreeProvider` | TreeView data + context menu actions |
| `workspaceState` | Persist `dontAskAgain` per workspace |

## User flows

### 1. Detect and suggest install

**Trigger:** workspace folder opens (or extension activates) and root has `requirements.txt`.

**Guards:**

- Skip if session `notNow` was chosen this session
- Skip if workspace `dontAskAgain` is true
- Optional: skip auto-prompt if user already has a healthy `.venv` with installs (implementation may still offer reinstall via command only — default for MVP: still offer if `requirements.txt` exists and `dontAskAgain` is false; “Not now” avoids spam)

**Notification actions:**

| Action | Behavior |
|--------|----------|
| **Install** | Run install-from-requirements flow |
| **Not now** | Suppress auto-prompt for this session only |
| **Don’t ask again** | Persist per-workspace; no auto-prompt until preference is cleared (future setting or reinstall) |

Manual command **“Install from requirements.txt”** always available regardless of preferences.

### 2. Install from requirements.txt

1. Resolve Python interpreter via Python extension  
   - If missing → error message: select an interpreter first  
2. If `.venv` missing at workspace root → `python -m venv .venv` with progress + log  
3. Run `.venv` pip: `python -m pip install -r requirements.txt` (prefer invoking the venv’s Python `-m pip`)  
4. Progress notification during work  
5. Full stdout/stderr on Output Channel  
6. Success or failure notification  
7. Refresh package TreeView  

### 3. Package management (Activity Bar)

TreeView lists packages from the project `.venv` (`pip list --format=json` preferred).

| Action | Behavior |
|--------|----------|
| **Refresh** | Re-run `pip list` |
| **Install package** | Prompt for package name/spec → `pip install <spec>` |
| **Uninstall** | Confirm → `pip uninstall -y <name>` |
| **Update** | `pip install -U <name>` |
| **Install from requirements.txt** | Same as flow 2 |

Empty / missing `.venv`: TreeView shows a placeholder message and action to create/install.

## State

| Key | Scope | Meaning |
|-----|--------|---------|
| `dontAskAgain` | `workspaceState` | User declined auto-prompt permanently for this workspace |
| `notNow` | in-memory session | User declined for this session only |

## Activation and contributes (extension surface)

**Activation events (illustrative):**

- `workspaceContains:requirements.txt`
- `workspaceContains:.venv`
- On command execution

**Commands (illustrative IDs):**

- `pythonDependenciesManager.installFromRequirements`
- `pythonDependenciesManager.refreshPackages`
- `pythonDependenciesManager.installPackage`
- `pythonDependenciesManager.uninstallPackage`
- `pythonDependenciesManager.updatePackage`

**Views:**

- Activity Bar container + TreeView for packages

**Extension dependency:**

- Soft dependency on `ms-python.python` (required for interpreter resolution; document as requirement)

## Error handling

| Situation | UX |
|-----------|-----|
| No Python extension / no interpreter | Clear error; do not invent a PATH fallback |
| `venv` creation fails | Error notification + Output Channel |
| `pip install` fails (network, conflict) | Error notification + full log in Output Channel |
| No `requirements.txt` on manual install command | Warning that file is missing at root |
| No `.venv` on list/CRUD | Offer to create / run install-from-requirements |

## Testing strategy (MVP)

- Unit-level: pure helpers (path resolution, preference flags, parsing `pip list --format=json`)
- Integration (extension host): command registration, TreeView provider with mocked pip service
- Manual checklist: open folder with `requirements.txt`, accept install, refuse Not now / Don’t ask again, CRUD on a package

## Future (out of scope now)

- Settings UI to re-enable prompts
- `pyproject.toml` / Poetry / uv
- Sync installed set back to `requirements.txt`
- Multi-folder detection
- Update-all
- Richer PyCharm-like Webview

## Decisions log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Package tool | pip only | Matches user workflow |
| Interpreter | Python extension only | Consistent with VS Code Python UX |
| Feedback | Progress + Output Channel | Visible without stealing terminal |
| Prompt dismissal | Not now + Don’t ask again | Balance between guidance and noise |
| Project layout | Single root folder | MVP simplicity |
| Package UI | Activity Bar TreeView | Clear manager UX without Webview cost |
| Implementation style | Shell-first subprocesses | Simple, debuggable, full control |
