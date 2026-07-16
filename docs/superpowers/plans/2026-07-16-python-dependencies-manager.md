# Python Dependencies Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an MVP VS Code extension that detects root `requirements.txt`, offers install, creates `.venv` if missing, runs pip with progress + Output Channel, and manages packages via an Activity Bar TreeView.

**Architecture:** Shell-first: resolve the active interpreter from `ms-python.python`, run `python -m venv` / `python -m pip` as subprocesses, and surface results in VS Code UI. Pure helpers are unit-tested; orchestration is wired in `extension.ts`.

**Tech Stack:** TypeScript, VS Code Extension API, webpack, mocha/`@vscode/test-electron`, Node `child_process`, pip + venv only (no Poetry/uv).

## Global Constraints

- Package tool: **pip only**
- Interpreter source: **Python extension (`ms-python.python`) only** — no PATH fallback
- Project layout: **single workspace folder**; `requirements.txt` and `.venv` at **workspace root only**
- Feedback: **progress notifications** + Output Channel named **`Python Dependencies Manager`**
- Prompt actions: **Install** | **Not now** (session) | **Don’t ask again** (workspaceState)
- Command IDs (already in `package.json`):  
  `pythonDependenciesManager.installFromRequirements`  
  `pythonDependenciesManager.refreshPackages`  
  `pythonDependenciesManager.installPackage`  
  `pythonDependenciesManager.uninstallPackage`  
  `pythonDependenciesManager.updatePackage`
- View id: `pythonDependenciesManager.packages`
- Tree item context value for packages: `package`
- Do not invent monorepo, Poetry, or update-all behavior
- Prefer TDD for pure modules; keep files small and focused
- Commit after each task with a focused message

## File map

| File | Responsibility |
|------|----------------|
| `src/workspaceRoot.ts` | Resolve single workspace root URI/path |
| `src/paths.ts` | Paths for `requirements.txt`, `.venv`, venv Python (win/unix) |
| `src/preferences.ts` | Session `notNow` + workspace `dontAskAgain` |
| `src/output.ts` | Shared Output Channel factory |
| `src/runProcess.ts` | Spawn process, stream to output, return exit code |
| `src/pythonInterpreter.ts` | Active interpreter path from Python extension |
| `src/venvService.ts` | Ensure `.venv` exists |
| `src/pipService.ts` | `list` / `install` / `uninstall` / `upgrade` / `installRequirements` |
| `src/installFlow.ts` | Orchestrate interpreter → venv → pip -r with progress |
| `src/packagesTree.ts` | TreeDataProvider for installed packages |
| `src/promptInstall.ts` | Detection + notification UX |
| `src/extension.ts` | Activate, register commands/views, kick off prompt |
| `src/test/*.test.ts` | Unit + command registration tests |

---

### Task 1: Workspace root + path helpers

**Files:**
- Create: `src/workspaceRoot.ts`
- Create: `src/paths.ts`
- Create: `src/test/paths.test.ts`
- Modify: `src/test/extension.test.ts` (keep command test; no conflict)

**Interfaces:**
- Produces:
  - `getWorkspaceRootFsPath(): string | undefined`
  - `requirementsTxtPath(root: string): string`
  - `venvDirPath(root: string): string`
  - `venvPythonPath(root: string): string` — Windows: `.venv/Scripts/python.exe`; else `.venv/bin/python`
  - `requirementsExists(root: string): boolean` (sync fs)
  - `venvExists(root: string): boolean` (sync fs)

- [ ] **Step 1: Write the failing tests**

Create `src/test/paths.test.ts`:

```typescript
import * as assert from 'assert';
import * as path from 'path';
import { requirementsTxtPath, venvDirPath, venvPythonPath } from '../paths';

suite('paths', () => {
	const root = path.join('/tmp', 'proj');

	test('requirementsTxtPath joins root', () => {
		assert.strictEqual(
			requirementsTxtPath(root),
			path.join(root, 'requirements.txt'),
		);
	});

	test('venvDirPath joins root', () => {
		assert.strictEqual(venvDirPath(root), path.join(root, '.venv'));
	});

	test('venvPythonPath is platform-specific', () => {
		const py = venvPythonPath(root);
		if (process.platform === 'win32') {
			assert.strictEqual(py, path.join(root, '.venv', 'Scripts', 'python.exe'));
		} else {
			assert.strictEqual(py, path.join(root, '.venv', 'bin', 'python'));
		}
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run compile-tests && pnpm test`  
Expected: FAIL — cannot find module `../paths` (or similar).

- [ ] **Step 3: Implement helpers**

`src/workspaceRoot.ts`:

```typescript
import * as vscode from 'vscode';

/** Single-folder MVP: first workspace folder only. */
export function getWorkspaceRootFsPath(): string | undefined {
	const folder = vscode.workspace.workspaceFolders?.[0];
	return folder?.uri.fsPath;
}
```

`src/paths.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';

export function requirementsTxtPath(root: string): string {
	return path.join(root, 'requirements.txt');
}

export function venvDirPath(root: string): string {
	return path.join(root, '.venv');
}

export function venvPythonPath(root: string): string {
	if (process.platform === 'win32') {
		return path.join(root, '.venv', 'Scripts', 'python.exe');
	}
	return path.join(root, '.venv', 'bin', 'python');
}

export function requirementsExists(root: string): boolean {
	try {
		return fs.statSync(requirementsTxtPath(root)).isFile();
	} catch {
		return false;
	}
}

export function venvExists(root: string): boolean {
	try {
		return fs.statSync(venvDirPath(root)).isDirectory();
	} catch {
		return false;
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run compile-tests && pnpm test`  
Expected: paths suite PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workspaceRoot.ts src/paths.ts src/test/paths.test.ts
git commit -m "feat: add workspace root and venv path helpers"
```

---

### Task 2: Prompt preferences (session + workspace)

**Files:**
- Create: `src/preferences.ts`
- Create: `src/test/preferences.test.ts`

**Interfaces:**
- Consumes: `vscode.ExtensionContext` (workspaceState)
- Produces:
  - `const DONT_ASK_AGAIN_KEY = 'pythonDependenciesManager.dontAskAgain'`
  - `class PromptPreferences`
    - `constructor(context: vscode.ExtensionContext)`
    - `get dontAskAgain(): boolean`
    - `setDontAskAgain(value: boolean): Thenable<void>`
    - `get notNowThisSession(): boolean`
    - `setNotNowThisSession(): void`
    - `shouldAutoPrompt(): boolean` — `!dontAskAgain && !notNowThisSession`

- [ ] **Step 1: Write the failing test**

```typescript
import * as assert from 'assert';
import { PromptPreferences } from '../preferences';

suite('PromptPreferences', () => {
	test('shouldAutoPrompt is false after notNow', () => {
		const state = new Map<string, unknown>();
		const fakeContext = {
			workspaceState: {
				get: <T>(key: string, defaultValue?: T) =>
					(state.has(key) ? state.get(key) : defaultValue) as T,
				update: async (key: string, value: unknown) => {
					state.set(key, value);
				},
			},
		} as unknown as import('vscode').ExtensionContext;

		const prefs = new PromptPreferences(fakeContext);
		assert.strictEqual(prefs.shouldAutoPrompt(), true);
		prefs.setNotNowThisSession();
		assert.strictEqual(prefs.shouldAutoPrompt(), false);
	});

	test('shouldAutoPrompt is false after dontAskAgain', async () => {
		const state = new Map<string, unknown>();
		const fakeContext = {
			workspaceState: {
				get: <T>(key: string, defaultValue?: T) =>
					(state.has(key) ? state.get(key) : defaultValue) as T,
				update: async (key: string, value: unknown) => {
					state.set(key, value);
				},
			},
		} as unknown as import('vscode').ExtensionContext;

		const prefs = new PromptPreferences(fakeContext);
		await prefs.setDontAskAgain(true);
		assert.strictEqual(prefs.shouldAutoPrompt(), false);
	});
});
```

- [ ] **Step 2: Run test — expect FAIL** (module missing)

Run: `pnpm run compile-tests && pnpm test`

- [ ] **Step 3: Implement**

```typescript
import * as vscode from 'vscode';

export const DONT_ASK_AGAIN_KEY = 'pythonDependenciesManager.dontAskAgain';

export class PromptPreferences {
	private notNow = false;

	constructor(private readonly context: vscode.ExtensionContext) {}

	get dontAskAgain(): boolean {
		return this.context.workspaceState.get<boolean>(DONT_ASK_AGAIN_KEY, false);
	}

	setDontAskAgain(value: boolean): Thenable<void> {
		return this.context.workspaceState.update(DONT_ASK_AGAIN_KEY, value);
	}

	get notNowThisSession(): boolean {
		return this.notNow;
	}

	setNotNowThisSession(): void {
		this.notNow = true;
	}

	shouldAutoPrompt(): boolean {
		return !this.dontAskAgain && !this.notNowThisSession;
	}
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/preferences.ts src/test/preferences.test.ts
git commit -m "feat: add install prompt preferences (session + workspace)"
```

---

### Task 3: Output channel + process runner

**Files:**
- Create: `src/output.ts`
- Create: `src/runProcess.ts`
- Create: `src/test/runProcess.test.ts`

**Interfaces:**
- Produces:
  - `getOutputChannel(): vscode.OutputChannel` (singleton per activation; create once in activate and pass in, **or** lazy singleton — prefer **pass channel into services** from activate)
  - `export type RunProcessResult = { code: number | null; stdout: string; stderr: string }`
  - `runProcess(options: { command: string; args: string[]; cwd: string; output: vscode.OutputChannel; onLog?: (line: string) => void }): Promise<RunProcessResult>`

- [ ] **Step 1: Write failing test for successful echo**

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import { runProcess } from '../runProcess';

suite('runProcess', () => {
	test('captures stdout and zero exit code', async () => {
		const lines: string[] = [];
		const output = {
			appendLine: (s: string) => lines.push(s),
			append: (s: string) => lines.push(s),
		} as unknown as vscode.OutputChannel;

		const isWin = process.platform === 'win32';
		const result = await runProcess({
			command: isWin ? 'cmd' : 'echo',
			args: isWin ? ['/c', 'echo hello-pdm'] : ['hello-pdm'],
			cwd: process.cwd(),
			output,
		});

		assert.strictEqual(result.code, 0);
		assert.ok(
			result.stdout.includes('hello-pdm') || lines.join('').includes('hello-pdm'),
			'expected hello-pdm in output',
		);
	});
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

`src/output.ts`:

```typescript
import * as vscode from 'vscode';

export const OUTPUT_CHANNEL_NAME = 'Python Dependencies Manager';

export function createOutputChannel(): vscode.OutputChannel {
	return vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
}
```

`src/runProcess.ts`:

```typescript
import { spawn } from 'child_process';
import type * as vscode from 'vscode';

export type RunProcessResult = {
	code: number | null;
	stdout: string;
	stderr: string;
};

export type RunProcessOptions = {
	command: string;
	args: string[];
	cwd: string;
	output: vscode.OutputChannel;
};

export function runProcess(options: RunProcessOptions): Promise<RunProcessResult> {
	const { command, args, cwd, output } = options;
	output.appendLine(`$ ${command} ${args.join(' ')}`);
	output.appendLine(`cwd: ${cwd}`);

	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			shell: false,
			env: process.env,
		});

		let stdout = '';
		let stderr = '';

		child.stdout.on('data', (chunk: Buffer) => {
			const text = chunk.toString();
			stdout += text;
			output.append(text);
		});
		child.stderr.on('data', (chunk: Buffer) => {
			const text = chunk.toString();
			stderr += text;
			output.append(text);
		});
		child.on('error', (err) => {
			output.appendLine(`Process error: ${err.message}`);
			reject(err);
		});
		child.on('close', (code) => {
			output.appendLine(`exit code: ${code}`);
			resolve({ code, stdout, stderr });
		});
	});
}
```

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/output.ts src/runProcess.ts src/test/runProcess.test.ts
git commit -m "feat: add output channel helper and process runner"
```

---

### Task 4: Python interpreter resolver

**Files:**
- Create: `src/pythonInterpreter.ts`
- Create: `src/test/pythonInterpreter.test.ts`

**Interfaces:**
- Produces:
  - `export class InterpreterError extends Error`
  - `getSelectedPythonPath(): Promise<string>`  
    - Activates `ms-python.python`  
    - Reads active environment path via extension API  
    - Throws `InterpreterError` with user-facing message if missing

**API shape to use (Python extension):**

```typescript
type PythonExtensionApi = {
	environments?: {
		getActiveEnvironmentPath?: (resource?: unknown) => { path: string } | string | undefined;
		resolveEnvironment?: (path: unknown) => Promise<{ executable?: { uri?: { fsPath: string } }; path?: string } | undefined>;
	};
	settings?: {
		getExecutionDetails?: (resource?: unknown) => { execCommand?: string[] | undefined };
	};
};
```

Resolution order:
1. `environments.getActiveEnvironmentPath()` → if object with `path`, use it; if string, use it
2. Else `settings.getExecutionDetails()?.execCommand?.[0]`
3. Else throw `InterpreterError('Select a Python interpreter (Python: Select Interpreter) before managing dependencies.')`

- [ ] **Step 1: Write test with fake extension export**

Because `vscode.extensions` is hard to mock in isolation, test a pure helper:

```typescript
import * as assert from 'assert';
import { resolvePythonPathFromApi, InterpreterError } from '../pythonInterpreter';

suite('resolvePythonPathFromApi', () => {
	test('uses environments.getActiveEnvironmentPath object path', async () => {
		const path = await resolvePythonPathFromApi({
			environments: {
				getActiveEnvironmentPath: () => ({ path: '/usr/bin/python3' }),
			},
		});
		assert.strictEqual(path, '/usr/bin/python3');
	});

	test('throws when missing', async () => {
		await assert.rejects(
			() => resolvePythonPathFromApi({}),
			(e: unknown) => e instanceof InterpreterError,
		);
	});
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```typescript
import * as vscode from 'vscode';

export class InterpreterError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InterpreterError';
	}
}

export type PythonExtensionApi = {
	environments?: {
		getActiveEnvironmentPath?: (resource?: unknown) => { path: string } | string | undefined;
	};
	settings?: {
		getExecutionDetails?: (resource?: unknown) => { execCommand?: string[] | undefined };
	};
};

export async function resolvePythonPathFromApi(api: PythonExtensionApi): Promise<string> {
	const active = api.environments?.getActiveEnvironmentPath?.();
	if (typeof active === 'string' && active.trim()) {
		return active.trim();
	}
	if (active && typeof active === 'object' && 'path' in active && active.path) {
		return String(active.path);
	}

	const exec = api.settings?.getExecutionDetails?.()?.execCommand?.[0];
	if (exec && exec.trim()) {
		return exec.trim();
	}

	throw new InterpreterError(
		'Select a Python interpreter (Python: Select Interpreter) before managing dependencies.',
	);
}

export async function getSelectedPythonPath(): Promise<string> {
	const ext = vscode.extensions.getExtension<PythonExtensionApi>('ms-python.python');
	if (!ext) {
		throw new InterpreterError(
			'The Python extension (ms-python.python) is required. Install it and select an interpreter.',
		);
	}
	if (!ext.isActive) {
		await ext.activate();
	}
	return resolvePythonPathFromApi(ext.exports ?? {});
}
```

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/pythonInterpreter.ts src/test/pythonInterpreter.test.ts
git commit -m "feat: resolve active Python interpreter from ms-python.python"
```

---

### Task 5: Venv service

**Files:**
- Create: `src/venvService.ts`
- Create: `src/test/venvService.test.ts` (logic around “skip if exists”; optional integration skipped if no python)

**Interfaces:**
- Consumes: `runProcess`, `venvExists`, `venvDirPath`
- Produces:
  - `ensureVenv(options: { root: string; pythonPath: string; output: vscode.OutputChannel }): Promise<void>`  
    - If `venvExists(root)` → log “already exists” and return  
    - Else `runProcess({ command: pythonPath, args: ['-m', 'venv', venvDirPath(root)], cwd: root, output })`  
    - If `code !== 0` throw `Error` with message including stderr snippet

- [ ] **Step 1: Write test with injectable runner**

Refactor interface to accept runner for testability:

```typescript
export type ProcessRunner = typeof runProcess;

export async function ensureVenv(options: {
	root: string;
	pythonPath: string;
	output: vscode.OutputChannel;
	venvAlreadyExists: boolean;
	run?: ProcessRunner;
}): Promise<'created' | 'exists'> {
  // ...
}
```

Test:

```typescript
import * as assert from 'assert';
import type * as vscode from 'vscode';
import { ensureVenv } from '../venvService';

suite('ensureVenv', () => {
	const output = { appendLine() {}, append() {} } as unknown as vscode.OutputChannel;

	test('skips creation when venv exists', async () => {
		let called = 0;
		const result = await ensureVenv({
			root: '/proj',
			pythonPath: '/usr/bin/python3',
			output,
			venvAlreadyExists: true,
			run: async () => {
				called += 1;
				return { code: 0, stdout: '', stderr: '' };
			},
		});
		assert.strictEqual(result, 'exists');
		assert.strictEqual(called, 0);
	});

	test('creates venv when missing', async () => {
		let args: string[] = [];
		const result = await ensureVenv({
			root: '/proj',
			pythonPath: '/usr/bin/python3',
			output,
			venvAlreadyExists: false,
			run: async (opts) => {
				args = opts.args;
				return { code: 0, stdout: '', stderr: '' };
			},
		});
		assert.strictEqual(result, 'created');
		assert.deepStrictEqual(args.slice(0, 2), ['-m', 'venv']);
	});
});
```

- [ ] **Step 2–4: Implement, pass tests, commit**

`src/venvService.ts` implementation must call `run` defaulting to `runProcess`, use `venvDirPath(root)` as last arg to `python -m venv`.

```bash
git commit -m "feat: ensure project .venv via python -m venv"
```

---

### Task 6: Pip service

**Files:**
- Create: `src/pipService.ts`
- Create: `src/test/pipService.test.ts`

**Interfaces:**
- Consumes: `runProcess`, `venvPythonPath`
- Produces:
  - `export type PackageInfo = { name: string; version: string }`
  - `listPackages({ root, output, run? }): Promise<PackageInfo[]>` — `venvPython -m pip list --format=json`
  - `installPackage({ root, output, spec, run? }): Promise<void>` — `pip install <spec>`
  - `uninstallPackage({ root, output, name, run? }): Promise<void>` — `pip uninstall -y <name>`
  - `updatePackage({ root, output, name, run? }): Promise<void>` — `pip install -U <name>`
  - `installRequirements({ root, output, run? }): Promise<void>` — `pip install -r requirements.txt`

All use `command: venvPythonPath(root)`, `args: ['-m', 'pip', ...]`, `cwd: root`.  
Non-zero exit → throw `Error` with last stderr lines.  
`listPackages` parses JSON array; on empty stdout return `[]`; on parse error throw.

- [ ] **Step 1: Tests**

```typescript
import * as assert from 'assert';
import type * as vscode from 'vscode';
import { listPackages, installPackage } from '../pipService';

suite('pipService', () => {
	const output = { appendLine() {}, append() {} } as unknown as vscode.OutputChannel;

	test('listPackages parses json', async () => {
		const pkgs = await listPackages({
			root: '/proj',
			output,
			run: async () => ({
				code: 0,
				stdout: JSON.stringify([
					{ name: 'requests', version: '2.32.0' },
					{ name: 'pip', version: '24.0' },
				]),
				stderr: '',
			}),
		});
		assert.deepStrictEqual(pkgs, [
			{ name: 'requests', version: '2.32.0' },
			{ name: 'pip', version: '24.0' },
		]);
	});

	test('installPackage throws on non-zero', async () => {
		await assert.rejects(() =>
			installPackage({
				root: '/proj',
				output,
				spec: 'nope',
				run: async () => ({ code: 1, stdout: '', stderr: 'boom' }),
			}),
		);
	});
});
```

- [ ] **Step 2–4: Implement all five operations, pass tests, commit**

```bash
git commit -m "feat: pip list/install/uninstall/upgrade/requirements helpers"
```

---

### Task 7: Install-from-requirements flow (progress + errors)

**Files:**
- Create: `src/installFlow.ts`
- Create: `src/test/installFlow.test.ts`

**Interfaces:**
- Produces:
  - `runInstallFromRequirements(deps: { root: string; output: vscode.OutputChannel; getPythonPath: () => Promise<string>; ensureVenv: ...; installRequirements: ...; withProgress?: typeof vscode.window.withProgress }): Promise<void>`

Flow:
1. `vscode.window.withProgress({ location: Notification, title: 'Python Dependencies', cancellable: false }, async (progress) => { ... })`
2. progress: “Resolving Python interpreter…” → `getPythonPath()`
3. progress: “Ensuring .venv…” → `ensureVenv`
4. progress: “Installing from requirements.txt…” → `installRequirements`
5. On success: `showInformationMessage('Dependencies installed successfully.')`
6. On `InterpreterError`: `showErrorMessage(err.message)`
7. On other errors: `showErrorMessage` + ensure output channel is shown (`output.show(true)`)

- [ ] **Step 1: Test orchestration order with fakes**

```typescript
import * as assert from 'assert';
import type * as vscode from 'vscode';
import { runInstallFromRequirements } from '../installFlow';

suite('runInstallFromRequirements', () => {
	test('calls python → venv → pip in order', async () => {
		const steps: string[] = [];
		const output = {
			appendLine() {},
			append() {},
			show() {},
		} as unknown as vscode.OutputChannel;

		await runInstallFromRequirements({
			root: '/proj',
			output,
			getPythonPath: async () => {
				steps.push('python');
				return '/usr/bin/python3';
			},
			ensureVenv: async () => {
				steps.push('venv');
				return 'created';
			},
			installRequirements: async () => {
				steps.push('pip');
			},
			withProgress: async (_opts, task) =>
				task({ report: () => {} } as vscode.Progress<{ message?: string; increment?: number }>),
			showInformationMessage: async () => undefined,
			showErrorMessage: async () => undefined,
		});

		assert.deepStrictEqual(steps, ['python', 'venv', 'pip']);
	});
});
```

- [ ] **Step 2–4: Implement, pass, commit**

```bash
git commit -m "feat: orchestrate install-from-requirements with progress"
```

---

### Task 8: Packages TreeView provider

**Files:**
- Create: `src/packagesTree.ts`
- Create: `src/test/packagesTree.test.ts`

**Interfaces:**
- Produces:
  - `export class PackageItem extends vscode.TreeItem`  
    - `constructor(public readonly pkg: PackageInfo)`  
    - `label = pkg.name`, `description = pkg.version`, `contextValue = 'package'`
  - `export class PackagesTreeProvider implements vscode.TreeDataProvider<PackageItem | vscode.TreeItem>`
    - `constructor(private readonly list: () => Promise<PackageInfo[]>)`
    - `refresh(): void` — fire `onDidChangeTreeData`
    - `getChildren`: if list fails or empty, return single non-package TreeItem with guidance text; else map to `PackageItem`

- [ ] **Step 1: Test getChildren mapping** (instantiate provider with fake list, call `getChildren()`)

- [ ] **Step 2–4: Implement, pass, commit**

```bash
git commit -m "feat: Activity Bar packages tree provider"
```

---

### Task 9: Detection prompt + wire extension.ts

**Files:**
- Create: `src/promptInstall.ts`
- Modify: `src/extension.ts` (replace stubs with real wiring)

**Interfaces:**
- `maybePromptInstallFromRequirements(options: { root: string | undefined; preferences: PromptPreferences; requirementsExists: boolean; onInstall: () => Promise<void> }): Promise<void>`
  - If no root or no requirements or `!preferences.shouldAutoPrompt()` → return
  - `showInformationMessage('requirements.txt detected. Install dependencies into .venv?', 'Install', 'Not now', "Don't ask again")`
  - Install → `onInstall()`
  - Not now → `setNotNowThisSession()`
  - Don't ask again → `setDontAskAgain(true)`

**extension.ts activate sketch:**

```typescript
export function activate(context: vscode.ExtensionContext) {
  const output = createOutputChannel();
  context.subscriptions.push(output);

  const preferences = new PromptPreferences(context);

  const tree = new PackagesTreeProvider(async () => {
    const root = getWorkspaceRootFsPath();
    if (!root || !venvExists(root)) {
      return [];
    }
    return listPackages({ root, output });
  });
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('pythonDependenciesManager.packages', tree),
  );

  const installFromRequirements = async () => {
    const root = getWorkspaceRootFsPath();
    if (!root) {
      void vscode.window.showErrorMessage('Open a folder workspace first.');
      return;
    }
    if (!requirementsExists(root)) {
      void vscode.window.showWarningMessage('No requirements.txt at workspace root.');
      return;
    }
    await runInstallFromRequirements({
      root,
      output,
      getPythonPath: getSelectedPythonPath,
      ensureVenv: async ({ root, pythonPath }) =>
        ensureVenv({
          root,
          pythonPath,
          output,
          venvAlreadyExists: venvExists(root),
        }),
      installRequirements: async () => installRequirements({ root, output }),
    });
    tree.refresh();
  };

  // register all 5 commands similarly...
  // installPackage: showInputBox → installPackage → refresh
  // uninstall/update: receive PackageItem from tree context

  void maybePromptInstallFromRequirements({
    root: getWorkspaceRootFsPath(),
    preferences,
    requirementsExists: (() => {
      const r = getWorkspaceRootFsPath();
      return r ? requirementsExists(r) : false;
    })(),
    onInstall: installFromRequirements,
  });
}
```

For `uninstallPackage` / `updatePackage`, signature must accept optional `PackageItem` argument from TreeView context.

- [ ] **Step 1: Unit test `maybePromptInstallFromRequirements` with fake message function**

Inject `showInformationMessage` for testability (same pattern as installFlow).

- [ ] **Step 2: Implement prompt + full `extension.ts`**

- [ ] **Step 3: Update `src/test/extension.test.ts`** to still assert command IDs exist after activate

- [ ] **Step 4: `pnpm run lint && pnpm test` — all green**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: wire activation, auto-prompt, and package commands"
```

---

### Task 10: Manual verification checklist + docs touch-up

**Files:**
- Modify: `README.md` (mark implementation status if needed)
- Modify: `CHANGELOG.md` (move items under Unreleased “Implemented” when done)
- Create: `docs/superpowers/plans/manual-checklist.md` (optional short checklist)

- [ ] **Step 1: Manual smoke (Extension Development Host, F5)**

1. Open a temp folder with a minimal `requirements.txt` containing e.g. `six==1.16.0`
2. Select a Python interpreter
3. Accept **Install** → `.venv` created, package installed, Output Channel has logs, TreeView lists packages
4. Reload; choose **Not now** → no second prompt same session
5. Reload window; choose **Don’t ask again** → no prompt; Command Palette still runs install
6. TreeView: Install package `wheel`, Update, Uninstall
7. Confirm missing interpreter shows clear error (deselect / uninstall python ext temporarily only if safe)

- [ ] **Step 2: Fix any bugs found (separate commits)**

- [ ] **Step 3: Update CHANGELOG Unreleased**

- [ ] **Step 4: Final commit**

```bash
git commit -m "docs: record MVP implementation status and manual checklist"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Detect root `requirements.txt` | 1, 9 |
| Notification Install / Not now / Don’t ask again | 2, 9 |
| Create `.venv` if missing | 5, 7 |
| pip install -r | 6, 7 |
| Interpreter from Python extension only | 4 |
| Progress + Output Channel | 3, 7 |
| Activity Bar TreeView list | 8, 9 |
| Install / uninstall / update single package | 6, 9 |
| Manual Install from requirements | 7, 9 |
| Single-folder / root only | 1, Global Constraints |
| No monorepo / Poetry / update-all | Not implemented (by design) |

## Placeholder scan

No TBD steps; injectable dependencies used where VS Code UI would block unit tests.

## Type consistency

- `PackageInfo`: `{ name: string; version: string }` in pipService → packagesTree  
- `runProcess` / `ProcessRunner` shared by venv + pip  
- Command IDs match `package.json` exactly  
- `contextValue === 'package'` matches menus in `package.json`

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-16-python-dependencies-manager.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
