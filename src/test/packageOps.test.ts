import * as assert from 'assert';
import type * as vscode from 'vscode';
import { addPackages, syncManifest } from '../packageOps';
import type { PackageManager } from '../packageManager/types';

function fakeOutput(): vscode.OutputChannel {
	return {
		append: () => {},
		appendLine: () => {},
		show: () => {},
	} as unknown as vscode.OutputChannel;
}

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
		const ok = await syncManifest({
			root: '/p',
			output: fakeOutput(),
			getPythonPath: async () => {
				steps.push('py');
				return '/py';
			},
			resolveManager: () => manager,
			venvExists: () => false,
			withProgress: async (_o, task) =>
				task(
					{ report: () => {} } as vscode.Progress<{ message?: string; increment?: number }>,
					{} as vscode.CancellationToken,
				),
			showInformationMessage: async () => undefined,
			showErrorMessage: async () => undefined,
		});
		assert.strictEqual(ok, true);
		assert.deepStrictEqual(steps, ['py', 'env', 'sync']);
	});

	test('returns false after handling failure (does not throw)', async () => {
		const manager: PackageManager = {
			id: 'uv',
			syncCommandTitle: 'Sync dependencies',
			manifestKind: 'pyproject.toml',
			afterAddShouldOfferManifestWrite: false,
			async ensureEnv() {
				return 'exists';
			},
			async syncManifest() {
				throw new Error('sync boom');
			},
			async addPackages() {},
			async removePackage() {},
			async updatePackage() {},
			async listPackages() {
				return [];
			},
		};
		const errors: string[] = [];
		const ok = await syncManifest({
			root: '/p',
			output: fakeOutput(),
			getPythonPath: async () => '/py',
			resolveManager: () => manager,
			venvExists: () => true,
			withProgress: async (_o, task) =>
				task(
					{ report: () => {} } as vscode.Progress<{ message?: string; increment?: number }>,
					{} as vscode.CancellationToken,
				),
			showInformationMessage: async () => undefined,
			showErrorMessage: async (msg: string) => {
				errors.push(String(msg));
				return undefined;
			},
		});
		assert.strictEqual(ok, false);
		assert.ok(errors.some((m) => /sync boom/.test(m)));
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
				task(
					{ report: () => {} } as vscode.Progress<{ message?: string; increment?: number }>,
					{} as vscode.CancellationToken,
				),
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
