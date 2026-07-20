import * as assert from 'assert';
import type * as vscode from 'vscode';
import { addPackages, syncManifest } from '../packageOps';
import type { PackageManager } from '../packageManager/types';
import { InterpreterError } from '../pythonInterpreter';

function fakeOutput(): vscode.OutputChannel {
	return {
		append: () => {},
		appendLine: () => {},
		show: () => {},
	} as unknown as vscode.OutputChannel;
}

function progressStub(
	_o: unknown,
	task: (
		progress: vscode.Progress<{ message?: string; increment?: number }>,
		token: vscode.CancellationToken,
	) => Thenable<unknown>,
): Thenable<unknown> {
	return task(
		{ report: () => {} } as vscode.Progress<{ message?: string; increment?: number }>,
		{} as vscode.CancellationToken,
	);
}

function stubManager(partial: Partial<PackageManager> & Pick<PackageManager, 'id'>): PackageManager {
	return {
		syncCommandTitle: partial.id === 'uv' ? 'Sync dependencies' : 'Install from requirements.txt',
		manifestKind: partial.id === 'uv' ? 'pyproject.toml' : 'requirements.txt',
		afterAddShouldOfferManifestWrite: partial.id === 'pip',
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
		...partial,
	};
}

suite('packageOps.syncManifest', () => {
	test('calls ensureEnv then syncManifest on resolved manager', async () => {
		const steps: string[] = [];
		const manager = stubManager({
			id: 'uv',
			async ensureEnv() {
				steps.push('env');
				return 'created';
			},
			async syncManifest() {
				steps.push('sync');
			},
		});
		const ok = await syncManifest({
			root: '/p',
			output: fakeOutput(),
			getPythonPath: async () => {
				steps.push('py');
				return '/py';
			},
			resolveManager: () => manager,
			venvExists: () => false,
			withProgress: progressStub as typeof vscode.window.withProgress,
			showInformationMessage: async () => undefined,
			showErrorMessage: async () => undefined,
		});
		assert.strictEqual(ok, true);
		assert.deepStrictEqual(steps, ['py', 'env', 'sync']);
	});

	test('shows installed success message for pip manager', async () => {
		const messages: string[] = [];
		const ok = await syncManifest({
			root: '/p',
			output: fakeOutput(),
			getPythonPath: async () => '/py',
			resolveManager: () => stubManager({ id: 'pip' }),
			venvExists: () => true,
			withProgress: progressStub as typeof vscode.window.withProgress,
			showInformationMessage: async (msg: string) => {
				messages.push(String(msg));
				return undefined;
			},
			showErrorMessage: async () => undefined,
		});
		assert.strictEqual(ok, true);
		assert.deepStrictEqual(messages, ['Dependencies installed successfully.']);
	});

	test('returns false after handling failure (does not throw)', async () => {
		const manager = stubManager({
			id: 'uv',
			async syncManifest() {
				throw new Error('sync boom');
			},
		});
		const errors: string[] = [];
		let shownPreserveFocus: boolean | undefined;
		const output = {
			append: () => {},
			appendLine: () => {},
			show(preserveFocus?: boolean) {
				shownPreserveFocus = preserveFocus;
			},
		} as unknown as vscode.OutputChannel;
		const ok = await syncManifest({
			root: '/p',
			output,
			getPythonPath: async () => '/py',
			resolveManager: () => manager,
			venvExists: () => true,
			withProgress: progressStub as typeof vscode.window.withProgress,
			showInformationMessage: async () => undefined,
			showErrorMessage: async (msg: string) => {
				errors.push(String(msg));
				return undefined;
			},
		});
		assert.strictEqual(ok, false);
		assert.ok(errors.some((m) => /sync boom/.test(m)));
		assert.strictEqual(shownPreserveFocus, true);
	});

	test('InterpreterError shows message without forcing output on error path', async () => {
		const errors: string[] = [];
		let showCount = 0;
		const output = {
			append: () => {},
			appendLine: () => {},
			show() {
				showCount += 1;
			},
		} as unknown as vscode.OutputChannel;
		const ok = await syncManifest({
			root: '/p',
			output,
			getPythonPath: async () => {
				throw new InterpreterError('Select a Python interpreter');
			},
			resolveManager: () => stubManager({ id: 'pip' }),
			venvExists: () => true,
			withProgress: progressStub as typeof vscode.window.withProgress,
			showInformationMessage: async () => undefined,
			showErrorMessage: async (msg: string) => {
				errors.push(String(msg));
				return undefined;
			},
		});
		assert.strictEqual(ok, false);
		assert.deepStrictEqual(errors, ['Select a Python interpreter']);
		// Output is opened at the start of the flow so the user can follow logs.
		assert.ok(showCount >= 1);
	});

	test('addPackages does not call freeze when flag false', async () => {
		let freezeCalls = 0;
		const manager = stubManager({
			id: 'uv',
			afterAddShouldOfferManifestWrite: false,
			async freezeToManifest() {
				freezeCalls++;
				return '/p/requirements.txt';
			},
		});
		const messages: string[] = [];
		await addPackages({
			root: '/p',
			output: fakeOutput(),
			getPythonPath: async () => '/py',
			resolveManager: () => manager,
			venvExists: () => true,
			specs: ['httpx'],
			withProgress: progressStub as typeof vscode.window.withProgress,
			showInformationMessage: async (msg: string) => {
				messages.push(String(msg));
				return undefined;
			},
			showErrorMessage: async () => undefined,
		});
		assert.strictEqual(freezeCalls, 0);
		assert.ok(messages.some((m) => /Installed/i.test(m)));
	});
});
