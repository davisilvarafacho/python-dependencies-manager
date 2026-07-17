# UV Native Package Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auto-detected dual package backends (pip + native uv) using Strategy + Template Method, without regressing pip/`requirements.txt` behavior.

**Architecture:** `resolvePackageManager(root)` chooses `PipManager` or `UvManager` (`uv` on PATH + root `pyproject.toml`). `packageOps` owns progress/log/error/refresh templates; strategies only run CLI via injectable `ProcessRunner`. List on uv uses the sole exception `uv pip list --format=json`.

**Tech Stack:** TypeScript, VS Code Extension API, existing `runProcess` / mocha `@vscode/test-electron`, shell `uv` / `python -m pip|venv`.

**Spec:** [docs/superpowers/specs/2026-07-17-uv-native-package-manager-design.md](../specs/2026-07-17-uv-native-package-manager-design.md)

## Global Constraints

- Detection: **uv on PATH AND `pyproject.toml` at workspace root** → uv; else pip
- Uv ops (native): `uv venv`, `uv sync`, `uv add`, `uv remove`, `uv lock --upgrade-package <name>` then `uv sync`
- Uv list **only exception:** `uv pip list --format=json`
- Pip path must stay **behavior-identical** to v1.0 for requirements-only projects
- Strategies **must not** call `vscode.window.*`
- Freeze offer after install: **pip only** (`afterAddShouldOfferManifestWrite`)
- Sync UI: pip = `Install from requirements.txt`; uv = `Sync dependencies`
- Auto-prompt only when **no `.venv`**; shared `notNow` / `dontAskAgain`
- Interpreter: still from **ms-python.python** for `ensureEnv` (pip venv + base for `uv venv`)
- Prefer TDD; commit after each task
- Run tests with: `pnpm run pretest` is heavy; prefer `pnpm run compile-tests && pnpm test` or compile-tests + mocha path used by project. Actual script: `pnpm test` (runs pretest → compile-tests + compile + lint + vscode-test). For unit suites during TDD: `pnpm run compile-tests` then run vscode-test if needed. Use existing pattern from repo.

## File map

| File | Responsibility |
|------|----------------|
| `src/paths.ts` | Add `pyprojectTomlPath` / `pyprojectExists` |
| `src/packageManager/types.ts` | `PackageInfo`, `PackageManager`, option types |
| `src/packageManager/detectUv.ts` | `isUvOnPath`, injectable checker |
| `src/packageManager/resolve.ts` | `resolvePackageManager(root, deps?)` |
| `src/packageManager/pipManager.ts` | Pip strategy wrapping pip/venv logic |
| `src/packageManager/uvManager.ts` | Uv strategy |
| `src/packageOps.ts` | Template Method: sync/add/remove/update/list + freeze gate |
| `src/installFlow.ts` | Thin re-export or call into `packageOps.syncManifest` |
| `src/promptInstall.ts` | Dual message: requirements vs pyproject/sync |
| `src/extension.ts` | setContext `isUv`, dual commands, use packageOps |
| `src/packagesWebview.ts` | Use dynamic sync title if wired via actions |
| `package.json` | activation, commands, menus, when clauses |
| `src/test/packageManager/*.test.ts` | resolve, uvManager, packageOps |
| `README*.md`, `CHANGELOG.md` | Document dual backend |

Keep `pipService.ts` / `venvService.ts` as implementations used by `PipManager` (minimal churn on existing tests).

---

### Task 1: Path helpers for `pyproject.toml`

**Files:**
- Modify: `src/paths.ts`
- Modify: `src/test/paths.test.ts`

**Interfaces:**
- Produces:
  - `pyprojectTomlPath(root: string): string`
  - `pyprojectExists(root: string): boolean`

- [ ] **Step 1: Write the failing tests**

Add to `src/test/paths.test.ts`:

```typescript
import { pyprojectTomlPath } from '../paths';

// inside suite('paths'):
test('pyprojectTomlPath joins root', () => {
	assert.strictEqual(pyprojectTomlPath(root), path.join(root, 'pyproject.toml'));
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm run compile-tests 2>&1 | tail -20`  
Expected: TS error or compile fails on missing export `pyprojectTomlPath`.

- [ ] **Step 3: Implement**

In `src/paths.ts`:

```typescript
export function pyprojectTomlPath(root: string): string {
	return path.join(root, 'pyproject.toml');
}

export function pyprojectExists(root: string): boolean {
	try {
		return fs.statSync(pyprojectTomlPath(root)).isFile();
	} catch {
		return false;
	}
}
```

- [ ] **Step 4: Compile tests**

Run: `pnpm run compile-tests`  
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/paths.ts src/test/paths.test.ts
git commit -m "feat(paths): add pyproject.toml helpers"
```

---

### Task 2: Detect uv + resolve strategy

**Files:**
- Create: `src/packageManager/detectUv.ts`
- Create: `src/packageManager/resolve.ts`
- Create: `src/packageManager/types.ts` (minimal: `PackageManagerId` + stub interface later expanded in Task 3 — put full interface in Task 3; here only id type if needed)
- Create: `src/test/packageManager/resolve.test.ts`

**Interfaces:**
- Produces:
  - `export type UvPresenceChecker = () => boolean`
  - `export function isUvOnPath(check?: UvPresenceChecker): boolean` — default uses `which`/`where` via `spawnSync` or `command -v`
  - `export type ResolvePackageManagerOptions = { isUvOnPath?: () => boolean; pyprojectExists?: (root: string) => boolean }`
  - `export function shouldUseUv(root: string, options?: ResolvePackageManagerOptions): boolean`

Note: full `resolvePackageManager` returning managers comes in Task 5 after both strategies exist. This task only locks detection pure logic.

- [ ] **Step 1: Write failing tests**

Create `src/test/packageManager/resolve.test.ts`:

```typescript
import * as assert from 'assert';
import { shouldUseUv } from '../../packageManager/resolve';

suite('shouldUseUv', () => {
	test('true when uv on path and pyproject exists', () => {
		assert.strictEqual(
			shouldUseUv('/proj', {
				isUvOnPath: () => true,
				pyprojectExists: () => true,
			}),
			true,
		);
	});

	test('false when uv missing', () => {
		assert.strictEqual(
			shouldUseUv('/proj', {
				isUvOnPath: () => false,
				pyprojectExists: () => true,
			}),
			false,
		);
	});

	test('false when pyproject missing', () => {
		assert.strictEqual(
			shouldUseUv('/proj', {
				isUvOnPath: () => true,
				pyprojectExists: () => false,
			}),
			false,
		);
	});
});
```

- [ ] **Step 2: Compile to see failure**

Run: `pnpm run compile-tests 2>&1 | tail -30`  
Expected: cannot find module `packageManager/resolve`.

- [ ] **Step 3: Implement detection + shouldUseUv**

`src/packageManager/detectUv.ts`:

```typescript
import { spawnSync } from 'child_process';

export type UvPresenceChecker = () => boolean;

/** Synchronous PATH check for the `uv` binary. */
export function isUvOnPath(): boolean {
	const isWin = process.platform === 'win32';
	const result = spawnSync(isWin ? 'where' : 'which', ['uv'], {
		encoding: 'utf8',
		shell: false,
	});
	return result.status === 0 && Boolean((result.stdout || '').trim());
}
```

`src/packageManager/resolve.ts`:

```typescript
import { pyprojectExists as defaultPyprojectExists } from '../paths';
import { isUvOnPath as defaultIsUvOnPath } from './detectUv';

export type ResolvePackageManagerOptions = {
	isUvOnPath?: () => boolean;
	pyprojectExists?: (root: string) => boolean;
};

export function shouldUseUv(
	root: string,
	options?: ResolvePackageManagerOptions,
): boolean {
	const isUv = options?.isUvOnPath ?? defaultIsUvOnPath;
	const hasPy = options?.pyprojectExists ?? defaultPyprojectExists;
	return isUv() && hasPy(root);
}
```

- [ ] **Step 4: Compile tests**

Run: `pnpm run compile-tests`  
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/packageManager/detectUv.ts src/packageManager/resolve.ts src/test/packageManager/resolve.test.ts
git commit -m "feat(packageManager): detect uv + shouldUseUv"
```

---

### Task 3: `PackageManager` types + `UvManager`

**Files:**
- Create: `src/packageManager/types.ts`
- Create: `src/packageManager/uvManager.ts`
- Create: `src/test/packageManager/uvManager.test.ts`

**Interfaces:**
- Produces (`types.ts`):

```typescript
import type * as vscode from 'vscode';
import type { ProcessRunner } from '../runProcess';

export type PackageInfo = { name: string; version: string };
export type PackageManagerId = 'pip' | 'uv';

export type ManagerContext = {
	root: string;
	output: vscode.OutputChannel;
	run?: ProcessRunner;
};

export type PackageManager = {
	readonly id: PackageManagerId;
	readonly syncCommandTitle: string;
	readonly manifestKind: 'requirements.txt' | 'pyproject.toml';
	readonly afterAddShouldOfferManifestWrite: boolean;

	ensureEnv(ctx: ManagerContext & { pythonPath: string; venvAlreadyExists: boolean }): Promise<'created' | 'exists'>;
	syncManifest(ctx: ManagerContext): Promise<void>;
	addPackages(ctx: ManagerContext & { specs: string[] }): Promise<void>;
	removePackage(ctx: ManagerContext & { name: string }): Promise<void>;
	updatePackage(ctx: ManagerContext & { name: string }): Promise<void>;
	listPackages(ctx: ManagerContext): Promise<PackageInfo[]>;
	/** Pip-only meaningful; uv may throw or no-op if called — prefer gate via afterAddShouldOfferManifestWrite */
	freezeToManifest?(ctx: ManagerContext): Promise<string>;
};
```

- Produces: `createUvManager(): PackageManager` (or `export const uvManager: PackageManager`)

**CLI mapping (exact argv):**

| Method | command | args |
|--------|---------|------|
| ensureEnv (create) | `uv` | `['venv', venvDirPath(root)]` — or `['venv']` with cwd=root (prefer `uv venv` with cwd root so `.venv` lands at root; document: `args: ['venv']`, `cwd: root`) |
| syncManifest | `uv` | `['sync']` |
| addPackages | `uv` | `['add', ...specs]` |
| removePackage | `uv` | `['remove', name]` |
| updatePackage | `uv` then `uv` | `['lock', '--upgrade-package', name]` then `['sync']` |
| listPackages | `uv` | `['pip', 'list', '--format=json']` |

On non-zero exit: throw `Error` with `uv <action> failed (exit code N): <snippet>` (mirror pipService style).

- [ ] **Step 1: Write failing uvManager tests**

```typescript
import * as assert from 'assert';
import type * as vscode from 'vscode';
import { createUvManager } from '../../packageManager/uvManager';
import type { ProcessRunner } from '../../runProcess';

function fakeOutput(): vscode.OutputChannel {
	return {
		append: () => {},
		appendLine: () => {},
	} as unknown as vscode.OutputChannel;
}

suite('uvManager', () => {
	const root = '/tmp/uv-proj';
	const output = fakeOutput();

	test('metadata', () => {
		const m = createUvManager();
		assert.strictEqual(m.id, 'uv');
		assert.strictEqual(m.syncCommandTitle, 'Sync dependencies');
		assert.strictEqual(m.afterAddShouldOfferManifestWrite, false);
		assert.strictEqual(m.manifestKind, 'pyproject.toml');
	});

	test('ensureEnv runs uv venv when missing', async () => {
		const calls: string[][] = [];
		const run: ProcessRunner = async (o) => {
			calls.push([o.command, ...o.args]);
			return { code: 0, stdout: '', stderr: '' };
		};
		const m = createUvManager();
		await m.ensureEnv({
			root,
			output,
			run,
			pythonPath: '/usr/bin/python3',
			venvAlreadyExists: false,
		});
		assert.ok(calls.some((c) => c[0] === 'uv' && c.includes('venv')));
	});

	test('ensureEnv skips when venv exists', async () => {
		let ran = false;
		const run: ProcessRunner = async () => {
			ran = true;
			return { code: 0, stdout: '', stderr: '' };
		};
		const m = createUvManager();
		const r = await m.ensureEnv({
			root,
			output,
			run,
			pythonPath: '/usr/bin/python3',
			venvAlreadyExists: true,
		});
		assert.strictEqual(r, 'exists');
		assert.strictEqual(ran, false);
	});

	test('syncManifest runs uv sync', async () => {
		let args: string[] | undefined;
		const run: ProcessRunner = async (o) => {
			args = o.args;
			return { code: 0, stdout: '', stderr: '' };
		};
		await createUvManager().syncManifest({ root, output, run });
		assert.deepStrictEqual(args, ['sync']);
	});

	test('addPackages runs uv add', async () => {
		let args: string[] | undefined;
		const run: ProcessRunner = async (o) => {
			args = o.args;
			return { code: 0, stdout: '', stderr: '' };
		};
		await createUvManager().addPackages({
			root,
			output,
			run,
			specs: ['requests', 'httpx'],
		});
		assert.deepStrictEqual(args, ['add', 'requests', 'httpx']);
	});

	test('removePackage runs uv remove', async () => {
		let args: string[] | undefined;
		const run: ProcessRunner = async (o) => {
			args = o.args;
			return { code: 0, stdout: '', stderr: '' };
		};
		await createUvManager().removePackage({ root, output, run, name: 'requests' });
		assert.deepStrictEqual(args, ['remove', 'requests']);
	});

	test('updatePackage runs lock --upgrade-package then sync', async () => {
		const calls: string[][] = [];
		const run: ProcessRunner = async (o) => {
			calls.push(o.args);
			return { code: 0, stdout: '', stderr: '' };
		};
		await createUvManager().updatePackage({ root, output, run, name: 'requests' });
		assert.deepStrictEqual(calls[0], ['lock', '--upgrade-package', 'requests']);
		assert.deepStrictEqual(calls[1], ['sync']);
	});

	test('listPackages parses uv pip list json', async () => {
		const run: ProcessRunner = async () => ({
			code: 0,
			stdout: JSON.stringify([{ name: 'httpx', version: '0.27.0' }]),
			stderr: '',
		});
		const pkgs = await createUvManager().listPackages({ root, output, run });
		assert.deepStrictEqual(pkgs, [{ name: 'httpx', version: '0.27.0' }]);
	});
});
```

- [ ] **Step 2: Compile — expect missing modules**

Run: `pnpm run compile-tests 2>&1 | tail -20`

- [ ] **Step 3: Implement types + uvManager**

Implement `createUvManager()` using `runProcess` default, `log(output, 'uv', ...)`, fail-on-nonzero helper similar to `pipService.failOnNonZero`.

For `listPackages`, parse JSON array like `pipService.listPackages`.

For `ensureEnv` when creating, optional: pass `--python ${pythonPath}` if uv supports it (`uv venv --python <path>`). Prefer:

```typescript
args: venvAlreadyExists ? [] : ['venv', '--python', pythonPath]
// or simply ['venv'] if simpler — prefer with --python for interpreter fidelity:
// uv venv --python <pythonPath>
```

Use: `command: 'uv', args: ['venv', '--python', pythonPath], cwd: root` when creating.

- [ ] **Step 4: Compile and run unit tests in VS Code test host**

Run: `pnpm test`  
Expected: new uvManager + resolve tests pass; existing tests pass.

If full `pnpm test` is too slow mid-task, at least `pnpm run compile-tests` + ensure no TS errors; run full suite before commit of wiring tasks.

- [ ] **Step 5: Commit**

```bash
git add src/packageManager/types.ts src/packageManager/uvManager.ts src/test/packageManager/uvManager.test.ts
git commit -m "feat(packageManager): UvManager with native uv CLI"
```

---

### Task 4: `PipManager` adapter

**Files:**
- Create: `src/packageManager/pipManager.ts`
- Create: `src/test/packageManager/pipManager.test.ts` (smoke: metadata + delegates install argv via mocked run through existing ensurePip path — or re-export tests)

**Interfaces:**
- Produces: `createPipManager(): PackageManager`
- Implementation delegates to existing:
  - `ensureVenv` from `venvService`
  - `installRequirements`, `installPackage`, `uninstallPackage`, `updatePackage`, `listPackages`, `freezeToRequirements` from `pipService`

Metadata:

```typescript
id: 'pip'
syncCommandTitle: 'Install from requirements.txt'
manifestKind: 'requirements.txt'
afterAddShouldOfferManifestWrite: true
```

- [ ] **Step 1: Write smoke test**

```typescript
import * as assert from 'assert';
import { createPipManager } from '../../packageManager/pipManager';

suite('pipManager', () => {
	test('metadata matches pip product copy', () => {
		const m = createPipManager();
		assert.strictEqual(m.id, 'pip');
		assert.strictEqual(m.syncCommandTitle, 'Install from requirements.txt');
		assert.strictEqual(m.afterAddShouldOfferManifestWrite, true);
		assert.strictEqual(m.manifestKind, 'requirements.txt');
	});
});
```

- [ ] **Step 2: Implement createPipManager wrapping pipService/venvService**

```typescript
import {
	freezeToRequirements,
	installPackage,
	installRequirements,
	listPackages,
	uninstallPackage,
	updatePackage,
} from '../pipService';
import { ensureVenv } from '../venvService';
import type { PackageManager } from './types';

export function createPipManager(): PackageManager {
	return {
		id: 'pip',
		syncCommandTitle: 'Install from requirements.txt',
		manifestKind: 'requirements.txt',
		afterAddShouldOfferManifestWrite: true,
		async ensureEnv(ctx) {
			return ensureVenv({
				root: ctx.root,
				pythonPath: ctx.pythonPath,
				output: ctx.output,
				venvAlreadyExists: ctx.venvAlreadyExists,
				run: ctx.run,
			});
		},
		async syncManifest(ctx) {
			await installRequirements({ root: ctx.root, output: ctx.output, run: ctx.run });
		},
		async addPackages(ctx) {
			await installPackage({ root: ctx.root, output: ctx.output, run: ctx.run, spec: ctx.specs });
		},
		async removePackage(ctx) {
			await uninstallPackage({ root: ctx.root, output: ctx.output, run: ctx.run, name: ctx.name });
		},
		async updatePackage(ctx) {
			await updatePackage({ root: ctx.root, output: ctx.output, run: ctx.run, name: ctx.name });
		},
		async listPackages(ctx) {
			return listPackages({ root: ctx.root, output: ctx.output, run: ctx.run });
		},
		async freezeToManifest(ctx) {
			return freezeToRequirements({ root: ctx.root, output: ctx.output, run: ctx.run });
		},
	};
}
```

- [ ] **Step 3: Move `PackageInfo` type**

- Export `PackageInfo` from `packageManager/types.ts`
- Change `pipService.ts` to `export type { PackageInfo } from './packageManager/types'` or keep local type and re-export from types as the single source — **prefer single source in types.ts**, update imports in `packagesTree.ts`, `packagesFilter.ts`, `packagesWebview.ts`, `extension.ts` to import from types or keep `pipService` re-export for less churn:

```typescript
// pipService.ts
export type { PackageInfo } from './packageManager/types';
// and use PackageInfo from types internally
```

Avoid breaking existing `from './pipService'` imports.

- [ ] **Step 4: Compile + existing pipService tests still pass**

Run: `pnpm test`  
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/packageManager/pipManager.ts src/test/packageManager/pipManager.test.ts src/pipService.ts src/**/*.ts
git commit -m "feat(packageManager): PipManager adapter over pipService"
```

---

### Task 5: `resolvePackageManager` returns Strategy

**Files:**
- Modify: `src/packageManager/resolve.ts`
- Modify: `src/test/packageManager/resolve.test.ts`

**Interfaces:**
- Produces:

```typescript
export function resolvePackageManager(
	root: string,
	options?: ResolvePackageManagerOptions & {
		createPip?: () => PackageManager;
		createUv?: () => PackageManager;
	},
): PackageManager
```

Default factories: `createPipManager` / `createUvManager`.

- [ ] **Step 1: Extend tests**

```typescript
test('resolvePackageManager returns uv id when shouldUseUv', () => {
	const m = resolvePackageManager('/proj', {
		isUvOnPath: () => true,
		pyprojectExists: () => true,
		createUv: () => ({ id: 'uv' } as PackageManager),
		createPip: () => ({ id: 'pip' } as PackageManager),
	});
	assert.strictEqual(m.id, 'uv');
});

test('resolvePackageManager returns pip otherwise', () => {
	const m = resolvePackageManager('/proj', {
		isUvOnPath: () => false,
		pyprojectExists: () => true,
		createUv: () => ({ id: 'uv' } as PackageManager),
		createPip: () => ({ id: 'pip' } as PackageManager),
	});
	assert.strictEqual(m.id, 'pip');
});
```

Use minimal stubs cast carefully, or return full fake managers.

- [ ] **Step 2: Implement resolvePackageManager**

```typescript
export function resolvePackageManager(root: string, options?: ...): PackageManager {
	const createPip = options?.createPip ?? createPipManager;
	const createUv = options?.createUv ?? createUvManager;
	return shouldUseUv(root, options) ? createUv() : createPip();
}
```

- [ ] **Step 3: Compile + test**

Run: `pnpm test`  
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/packageManager/resolve.ts src/test/packageManager/resolve.test.ts
git commit -m "feat(packageManager): resolvePackageManager factory"
```

---

### Task 6: Template Method `packageOps`

**Files:**
- Create: `src/packageOps.ts`
- Create: `src/test/packageOps.test.ts`
- Modify: `src/installFlow.ts` to delegate or keep parallel API

**Interfaces:**
- Produces:

```typescript
export type PackageOpsDeps = {
	root: string;
	output: vscode.OutputChannel;
	getPythonPath: () => Promise<string>;
	resolveManager?: (root: string) => PackageManager;
	venvExists: (root: string) => boolean;
	withProgress?: typeof vscode.window.withProgress;
	showInformationMessage?: typeof vscode.window.showInformationMessage;
	showErrorMessage?: typeof vscode.window.showErrorMessage;
	onRefresh?: () => void;
};

export async function syncManifest(deps: PackageOpsDeps): Promise<void>;
export async function addPackages(deps: PackageOpsDeps & { specs: string[] }): Promise<void>;
export async function removePackage(deps: PackageOpsDeps & { name: string }): Promise<void>;
export async function updatePackage(deps: PackageOpsDeps & { name: string }): Promise<void>;
export async function listInstalled(deps: Pick<PackageOpsDeps, 'root' | 'output' | 'resolveManager'>): Promise<PackageInfo[]>;
```

**Template for `syncManifest`:**

1. log section with manager.syncCommandTitle  
2. output.show(true)  
3. withProgress title `Python Dependencies`  
4. getPythonPath  
5. manager.ensureEnv({ venvAlreadyExists: venvExists(root), pythonPath })  
6. manager.syncManifest  
7. success message: pip → `Dependencies installed successfully.`; uv → `Dependencies synced successfully.`  
8. onRefresh?.()  
9. on error: showErrorMessage + log (reuse installFlow patterns including InterpreterError)

**Template for `addPackages`:**

1. progress Installing…  
2. manager.addPackages  
3. if `afterAddShouldOfferManifestWrite` && freezeToManifest → offer Yes/No freeze (pip messages)  
4. else short Installed toast  
5. onRefresh

- [ ] **Step 1: Write packageOps tests (no real VS Code UI)**

```typescript
suite('packageOps.syncManifest', () => {
	test('calls ensureEnv then syncManifest on resolved manager', async () => {
		const steps: string[] = [];
		const manager: PackageManager = {
			id: 'uv',
			syncCommandTitle: 'Sync dependencies',
			manifestKind: 'pyproject.toml',
			afterAddShouldOfferManifestWrite: false,
			async ensureEnv() {
				steps.push('env');
				return 'created';
			},
			async syncManifest() {
				steps.push('sync');
			},
			async addPackages() {},
			async removePackage() {},
			async updatePackage() {},
			async listPackages() {
				return [];
			},
		};
		await syncManifest({
			root: '/p',
			output: fakeOutput(),
			getPythonPath: async () => {
				steps.push('py');
				return '/py';
			},
			resolveManager: () => manager,
			venvExists: () => false,
			withProgress: async (_o, task) =>
				task({ report: () => {} } as vscode.Progress<{ message?: string }>),
			showInformationMessage: async () => undefined,
			showErrorMessage: async () => undefined,
		});
		assert.deepStrictEqual(steps, ['py', 'env', 'sync']);
	});

	test('addPackages does not call freeze when flag false', async () => {
		let freezeCalls = 0;
		const manager: PackageManager = {
			id: 'uv',
			syncCommandTitle: 'Sync dependencies',
			manifestKind: 'pyproject.toml',
			afterAddShouldOfferManifestWrite: false,
			async ensureEnv() {
				return 'exists';
			},
			async syncManifest() {},
			async addPackages() {},
			async removePackage() {},
			async updatePackage() {},
			async listPackages() {
				return [];
			},
			async freezeToManifest() {
				freezeCalls++;
				return '/p/requirements.txt';
			},
		};
		const messages: string[] = [];
		await addPackages({
			root: '/p',
			output: fakeOutput(),
			getPythonPath: async () => '/py',
			resolveManager: () => manager,
			venvExists: () => true,
			specs: ['httpx'],
			withProgress: async (_o, task) =>
				task({ report: () => {} } as vscode.Progress<{ message?: string }>),
			showInformationMessage: async (msg) => {
				messages.push(String(msg));
				return undefined;
			},
			showErrorMessage: async () => undefined,
		});
		assert.strictEqual(freezeCalls, 0);
		assert.ok(messages.some((m) => /Installed/i.test(m)));
	});
});
```

- [ ] **Step 2: Implement packageOps.ts**

Port error handling from `installFlow.ts` (InterpreterError special case).

- [ ] **Step 3: Point installFlow at packageOps (optional thin wrapper)**

Either:

```typescript
// installFlow.ts — keep export runInstallFromRequirements for tests but implement via packageOps
```

Update `src/test/installFlow.test.ts` if signatures change — preserve step order assertions by adapting mocks to manager template **or** keep installFlow API and have it accept ensureVenv/installRequirements as today for pip-only tests; extension will call packageOps going forward.

**Preferred:** Keep `runInstallFromRequirements` working for existing tests; extension switches to `packageOps.syncManifest` in Task 7. No need to break installFlow tests in this task.

- [ ] **Step 4: Compile + test**

Run: `pnpm test`  
Expected: packageOps + previous pass.

- [ ] **Step 5: Commit**

```bash
git add src/packageOps.ts src/test/packageOps.test.ts
git commit -m "feat: packageOps template for sync/add flows"
```

---

### Task 7: Wire `extension.ts` + `package.json`

**Files:**
- Modify: `package.json`
- Modify: `src/extension.ts`
- Modify: `src/packagesWebview.ts` (action label for sync if hardcoded)
- Modify: `src/test/extension.test.ts` if it asserts command list

**package.json changes:**

1. activationEvents add: `"workspaceContains:pyproject.toml"`
2. commands add:

```json
{
  "command": "pythonDependenciesManager.syncDependencies",
  "title": "Sync dependencies",
  "category": "Python Dependencies",
  "icon": "$(sync)"
}
```

3. menus view/title: show `installFromRequirements` when `view == … && !pythonDependenciesManager.isUv`; show `syncDependencies` when `view == … && pythonDependenciesManager.isUv`
4. commandPalette: same when clauses if needed
5. keywords add `"uv"`

**extension.ts changes:**

```typescript
import { resolvePackageManager } from './packageManager/resolve';
import * as packageOps from './packageOps';
import { pyprojectExists } from './paths';

function updateBackendContext(root: string | undefined): void {
	const isUv = root ? resolvePackageManager(root).id === 'uv' : false;
	void vscode.commands.executeCommand('setContext', 'pythonDependenciesManager.isUv', isUv);
}

// on activate:
updateBackendContext(getWorkspaceRootFsPath());

const syncOrInstall = async () => {
	const root = requireRoot();
	if (!root) return;
	const manager = resolvePackageManager(root);
	if (manager.id === 'pip' && !requirementsExists(root)) {
		void vscode.window.showWarningMessage('No requirements.txt at workspace root.');
		return;
	}
	if (manager.id === 'uv' && !pyprojectExists(root)) {
		void vscode.window.showWarningMessage('No pyproject.toml at workspace root.');
		return;
	}
	await packageOps.syncManifest({
		root,
		output,
		getPythonPath: () => getSelectedPythonPath(),
		venvExists,
		onRefresh: () => packagesViewRef.current?.refresh(),
	});
};

// installFromRequirements command → syncOrInstall (or keep name; both commands call same)
// syncDependencies command → syncOrInstall

// loadPackages → packageOps.listInstalled or resolveManager().listPackages
// installSpecsAndMaybeFreeze → packageOps.addPackages
// uninstall → packageOps.removePackage
// update → packageOps.updatePackage

// offerNoVenvRecovery: use resolvePackageManager(root).syncCommandTitle as action button
```

Register both commands to `syncOrInstall`.

- [ ] **Step 1: Apply package.json edits**
- [ ] **Step 2: Refactor extension to packageOps + setContext**
- [ ] **Step 3: Grep webview for hardcoded “Install from requirements”**

Update button tooltips/labels passed from provider if any.

- [ ] **Step 4: Run full test suite**

Run: `pnpm test`  
Expected: pass. Fix extension.test if command registration count changes.

- [ ] **Step 5: Commit**

```bash
git add package.json src/extension.ts src/packagesWebview.ts src/test/extension.test.ts
git commit -m "feat: wire uv/pip backends into extension and package.json"
```

---

### Task 8: Dual auto-prompt

**Files:**
- Modify: `src/promptInstall.ts`
- Modify: `src/test/promptInstall.test.ts`
- Modify: `src/extension.ts` activate prompt call

**Interfaces:**

```typescript
export type MaybePromptInstallOptions = {
	root: string | undefined;
	preferences: PromptPreferences;
	/** True when the active backend's manifest exists */
	manifestPresent: boolean;
	venvExists: boolean;
	/** e.g. "requirements.txt detected..." vs "pyproject.toml detected..." */
	message: string;
	/** Primary button label: Install | Sync */
	primaryActionLabel: string;
	onInstall: () => Promise<void>;
	showInformationMessage?: typeof vscode.window.showInformationMessage;
};
```

Logic: prompt if `root && manifestPresent && !venvExists && preferences.shouldAutoPrompt()`.

Buttons: `primaryActionLabel`, `Not now`, `Don't ask again`.

**extension activate:**

```typescript
const root = getWorkspaceRootFsPath();
const manager = root ? resolvePackageManager(root) : undefined;
void maybePromptInstallFromRequirements({
	root,
	preferences,
	manifestPresent: root && manager
		? manager.id === 'uv'
			? pyprojectExists(root)
			: requirementsExists(root)
		: false,
	venvExists: root ? venvExists(root) : false,
	message:
		manager?.id === 'uv'
			? 'pyproject.toml detected. Sync dependencies into .venv with uv?'
			: 'requirements.txt detected. Install dependencies into .venv?',
	primaryActionLabel: manager?.id === 'uv' ? 'Sync' : 'Install',
	onInstall: syncOrInstall,
});
```

- [ ] **Step 1: Update promptInstall tests for new options**
- [ ] **Step 2: Implement + wire extension**
- [ ] **Step 3: `pnpm test`**
- [ ] **Step 4: Commit**

```bash
git add src/promptInstall.ts src/test/promptInstall.test.ts src/extension.ts
git commit -m "feat: auto-prompt for uv sync and pip install"
```

---

### Task 9: Docs + changelog + manual checklist

**Files:**
- Modify: `README.md`, `README.en.md`, `README.es.md`, `README.fr.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/plans/manual-checklist.md` (add uv scenarios)

**Content to add (all languages, adapt):**

- Dual backend auto-detect
- Prerequisites: optional `uv` on PATH for pyproject projects
- Commands: Sync dependencies vs Install from requirements.txt
- Note: list uses `uv pip list` under the hood only for listing

CHANGELOG under Unreleased / 1.1.0:

```markdown
### Added
- Native **uv** backend when `uv` is on PATH and `pyproject.toml` exists (`sync` / `add` / `remove` / `venv`)
- Command **Sync dependencies**
```

- [ ] **Step 1: Edit docs**
- [ ] **Step 2: Commit**

```bash
git add README.md README.en.md README.es.md README.fr.md CHANGELOG.md docs/superpowers/plans/manual-checklist.md
git commit -m "docs: document uv native backend"
```

---

### Task 10: Final verification

- [ ] **Step 1: Full CI-like check**

```bash
pnpm run lint
pnpm test
pnpm run package
```

Expected: lint clean, all tests pass, webpack production build OK.

- [ ] **Step 2: Manual smoke (if uv installed)**

1. Open fixture or temp dir with only `requirements.txt` → pip command visible, no isUv  
2. Open dir with `pyproject.toml` + uv installed → Sync dependencies, context isUv true  
3. Sync creates `.venv` and installs  
4. Add package via + → `uv add` updates pyproject  
5. No freeze dialog on uv  

- [ ] **Step 3: Final commit only if fixes needed**

```bash
git commit -m "fix: address verification findings for uv backend"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Auto-detect uv PATH + pyproject | 2, 5 |
| Native uv CLI (venv/sync/add/remove/lock+sync) | 3 |
| List via `uv pip list` | 3 |
| Pip identical via PipManager | 4, 7 |
| Strategy + Template | 3–6 |
| Sync dependencies label + command | 7 |
| No freeze on uv after add | 6, 7 |
| Dual auto-prompt | 8 |
| Activation pyproject.toml | 7 |
| Errors / NoVenv dynamic title | 7 |
| Docs | 9 |
| Tests resolve/uv/packageOps/pip regression | 2–6, 10 |

## Placeholder / consistency self-review

- No TBD left in tasks  
- Types: `PackageManager`, `ManagerContext`, `PackageOpsDeps` consistent across tasks  
- Command id: `pythonDependenciesManager.syncDependencies`  
- Context key: `pythonDependenciesManager.isUv`  
- `PackageInfo` single source in `packageManager/types.ts` with re-export from pipService  

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-17-uv-native-package-manager.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — implement in this session with executing-plans checkpoints  

Which approach?
