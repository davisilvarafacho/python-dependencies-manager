# UV Native Package Manager — Design Spec

**Date:** 2026-07-17  
**Status:** Approved  
**Scope:** Dual backend (pip + uv nativo) with Strategy + Template Method  
**Depends on:** [2026-07-16-python-dependencies-manager-design.md](./2026-07-16-python-dependencies-manager-design.md) (MVP pip)

## Problem

The extension MVP manages project dependencies only with **pip** + `python -m venv` and `requirements.txt`. Many modern Python projects use **[uv](https://github.com/astral-sh/uv)** with `pyproject.toml` / `uv.lock` and native commands (`uv add`, `uv sync`, `uv remove`, `uv venv`).

Users expect the same Activity Bar UX to work on uv projects without forcing `uv pip` for every operation.

## Goals

- **Auto-detect** when to use uv vs pip
- In uv mode, use **native uv CLI** for env + dependency ops:
  - `uv venv`, `uv sync`, `uv add`, `uv remove`, upgrade via `uv lock --upgrade-package` + `uv sync`
- **Single exception for list:** `uv pip list --format=json` (pragmatic parity with current tree/webview)
- Keep **pip behavior identical** for projects that do not qualify for uv mode
- Structure code with **Strategy** (backends) + **Template Method** (shared UI/orchestration) to avoid duplication

## Non-goals

- Auto-migrate `requirements.txt` → `pyproject.toml`
- `uv init` when `pyproject.toml` is missing
- Monorepo / multi-root / multiple manifests
- Manual setting to force uv/pip (possible follow-up)
- Full uv workspace / extras / dev-group UI (sync uses uv defaults)
- Replacing list with pure lockfile parsing (deferred; list uses the exception above)

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| Detection | **uv on PATH** AND **`pyproject.toml` at workspace root** → Uv; else Pip |
| CLI style | Native uv (`add` / `sync` / `remove` / `venv`), **not** `uv pip` for install/remove/sync |
| List packages (uv) | `uv pip list --format=json` only exception |
| Sync UI label (uv) | **“Sync dependencies”** (not “Install from requirements.txt”) |
| Architecture | Strategy (`PackageManager`) + Template (`packageOps`) |
| Freeze after install | Pip: offer `pip freeze` → `requirements.txt`. Uv: **no** offer (`uv add` already edits pyproject) |
| Auto-prompt | Same rules as MVP: only when **no `.venv`**; preferências `notNow` / `dontAskAgain` shared |

## Architecture

### Overview

```
UI / commands / webview
        │
        ▼
┌───────────────────────────┐
│  packageOps (Template)    │  progress + log + error + refresh
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│  PackageManager (Strategy)│
└─────────────┬─────────────┘
       ┌──────┴──────┐
       ▼             ▼
  PipManager     UvManager
       ▲
 resolvePackageManager(root)
```

### Strategy interface (`PackageManager`)

| Member | Pip | Uv |
|--------|-----|-----|
| `id` | `'pip'` | `'uv'` |
| `ensureEnv({ root, pythonPath })` | `python -m venv .venv` | `uv venv` |
| `syncManifest({ root })` | ensurepip + `pip install -r requirements.txt` | `uv sync` |
| `addPackages({ root, specs[] })` | `pip install …` | `uv add …` |
| `removePackage({ root, name })` | `pip uninstall -y` | `uv remove` |
| `updatePackage({ root, name })` | `pip install -U` | `uv lock --upgrade-package <name>` then `uv sync` |
| `listPackages({ root })` | `python -m pip list --format=json` | `uv pip list --format=json` |
| `afterAddShouldOfferManifestWrite` | `true` | `false` |
| `syncCommandTitle` | `"Install from requirements.txt"` | `"Sync dependencies"` |
| `manifestKind` | `'requirements.txt'` | `'pyproject.toml'` |

Strategies:

- Receive `output` + injectable `ProcessRunner` (existing pattern)
- **Must not** call `vscode.window.*` (no UI)

### Template Method (`packageOps`)

Shared skeleton for all mutating flows:

1. Resolve workspace root  
2. Resolve strategy via `resolvePackageManager`  
3. Show Output Channel + progress notification  
4. Invoke strategy hook(s)  
5. Success toast or error toast + log stack  
6. Refresh packages view  

Examples:

- `syncManifest` → `getPythonPath` → `ensureEnv` → `syncManifest`
- `addPackages` → strategy add → if `afterAddShouldOfferManifestWrite` then freeze prompt (pip only)
- `removePackage` / `updatePackage` → strategy → refresh
- `listPackages` → strategy list (used by webview loader)

`installFlow.ts` becomes a thin wrapper around `packageOps.syncManifest` or is merged into it.

### Detection (`resolvePackageManager`)

```
if (isUvOnPath() && hasPyprojectToml(root)) → UvManager
else → PipManager
```

- `isUvOnPath`: resolve `uv` / `uv.exe` via PATH (session cache optional)
- Project with only `requirements.txt` → always Pip
- Project with `pyproject.toml` but **no** uv → Pip (no crash; no silent uv calls)

## User flows

### Auto-prompt on folder open

| Backend | Condition | Primary action |
|---------|-----------|----------------|
| Pip | `requirements.txt` present, **no** `.venv` | Install from requirements.txt |
| Uv | `pyproject.toml` present, **no** `.venv` | Sync dependencies (`uv sync`) |

If `.venv` already exists → no auto-prompt (same as current MVP).  
Manual sync/install command always available.

### Sync / install from manifest

```
resolve root → resolve strategy → progress
  → resolve Python interpreter (Python extension; used for pip venv and as base for uv venv)
  → strategy.ensureEnv
  → strategy.syncManifest
→ success + refresh
```

### Package CRUD

| UI action | Pip | Uv | After |
|-----------|-----|-----|--------|
| Install (PyPI QuickPick) | `pip install` | `uv add` | Pip: optional freeze; Uv: none |
| Uninstall | `pip uninstall -y` | `uv remove` | refresh |
| Update | `pip install -U` | lock upgrade-package + sync | refresh |
| Refresh | `pip list --format=json` | `uv pip list --format=json` | — |

## UI / contribution points

### Activation events

Add:

- `workspaceContains:pyproject.toml`
- (optional) `workspaceContains:uv.lock`

Keep existing: `requirements.txt`, `.venv`, view/commands.

### Commands

| Command id | Title | `when` (palette / menus) |
|------------|-------|---------------------------|
| `pythonDependenciesManager.installFromRequirements` | Install from requirements.txt | `!pythonDependenciesManager.isUv` |
| `pythonDependenciesManager.syncDependencies` | Sync dependencies | `pythonDependenciesManager.isUv` |

Both invoke the same template: `packageOps.syncManifest`.

On activate (and when workspace folder changes, if applicable):

```ts
setContext('pythonDependenciesManager.isUv', manager?.id === 'uv')
```

### Dynamic copy

Empty states, progress messages, and “no venv” hints use `strategy.syncCommandTitle` so uv users never see “requirements.txt” when in uv mode.

## Error handling

| Situation | Behavior |
|-----------|----------|
| No folder workspace | Existing error |
| Pip: no interpreter | Existing `InterpreterError` |
| Uv binary missing mid-session | Clear error: uv not found on PATH |
| Non-zero exit from uv/pip | Exit code + stderr snippet in Output + error toast |
| List/install without `.venv` | `NoVenvError` suggesting strategy sync title |
| `uv add` on invalid project metadata | Surface uv stderr; no auto-fix/migrate |

## Module layout

```
src/
  packageManager/
    types.ts          # PackageManager, PackageInfo, shared option types
    resolve.ts        # resolvePackageManager
    detectUv.ts       # isUvOnPath, hasPyprojectToml
    pipManager.ts     # Pip strategy (logic from pipService + venvService)
    uvManager.ts      # Uv strategy
  packageOps.ts       # Template Method orchestration + UI
  installFlow.ts      # thin wrapper or folded into packageOps
  pipService.ts       # internals / re-exports for minimal test churn
  venvService.ts      # used by PipManager
  extension.ts        # wiring + setContext
  paths.ts            # add pyproject.toml path helper
```

## Testing

| Suite | Coverage |
|-------|----------|
| `resolve.test.ts` | uv+pyproject → uv; requirements only → pip; pyproject without uv → pip |
| `uvManager.test.ts` | argv for venv, sync, add, remove, lock+sync, pip list |
| pip / `pipService` / pipManager | regression: same pip argv as v1.0 |
| `packageOps.test.ts` | template order ensureEnv → sync; no freeze offer on uv after add |
| installFlow | wrapper or merged tests |

## Acceptance criteria

1. **Pip-only projects** (`requirements.txt`, no uv path or no pyproject): behavior **identical** to v1.0.  
2. **Uv projects** (`pyproject.toml` + uv on PATH):  
   - Primary command label **Sync dependencies**  
   - Sync = `uv venv` (if needed) + `uv sync`  
   - Install = `uv add`  
   - Uninstall = `uv remove`  
   - Update = `uv lock --upgrade-package` + `uv sync`  
   - List = `uv pip list --format=json`  
3. No auto-prompt when `.venv` already exists.  
4. `pyproject.toml` without uv on PATH → Pip backend, no crash.  
5. Output Channel logs distinguish `uv` vs `pip` scopes.  
6. Unit tests green for resolve, uvManager, and pip regression.

## Implementation order

1. `types` + `detectUv` + `resolve` + tests  
2. `UvManager` + tests  
3. `PipManager` extraction + pip regression tests  
4. `packageOps` template + `extension` / `package.json` wiring + context  
5. Dual `promptInstall` + dynamic empty-state strings  
6. README / CHANGELOG / manual checklist updates  

## Open follow-ups (out of this spec)

- User setting `pythonDependenciesManager.packageManager`: `auto` | `pip` | `uv`
- Dev dependency group UI (`uv add --dev`)
- Prefer list from lockfile / `uv tree` without `uv pip list`
- Multi-root workspace support
