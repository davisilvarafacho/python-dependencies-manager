import type * as vscode from 'vscode';
import type { PackageManager } from './packageManager/types';
import { syncManifest } from './packageOps';

export type EnsureVenvFn = (options: {
	root: string;
	pythonPath: string;
}) => Promise<'created' | 'exists' | void>;

export type InstallRequirementsFn = () => Promise<void>;

export type RunInstallFromRequirementsDeps = {
	root: string;
	output: vscode.OutputChannel;
	getPythonPath: () => Promise<string>;
	ensureVenv: EnsureVenvFn;
	installRequirements: InstallRequirementsFn;
	withProgress?: typeof vscode.window.withProgress;
	showInformationMessage?: typeof vscode.window.showInformationMessage;
	showErrorMessage?: typeof vscode.window.showErrorMessage;
};

/**
 * Compatibility wrapper around packageOps.syncManifest for tests / callers
 * that inject ensureVenv + installRequirements directly.
 * Production code should call packageOps.syncManifest with resolvePackageManager.
 */
export async function runInstallFromRequirements(
	deps: RunInstallFromRequirementsDeps,
): Promise<void> {
	const adapter: PackageManager = {
		id: 'pip',
		syncCommandTitle: 'Install from requirements.txt',
		manifestKind: 'requirements.txt',
		afterAddShouldOfferManifestWrite: true,
		async ensureEnv({ root, pythonPath }) {
			const result = await deps.ensureVenv({ root, pythonPath });
			return result === 'created' ? 'created' : 'exists';
		},
		async syncManifest() {
			await deps.installRequirements();
		},
		async addPackages() {
			throw new Error('not used by runInstallFromRequirements');
		},
		async removePackage() {
			throw new Error('not used by runInstallFromRequirements');
		},
		async updatePackage() {
			throw new Error('not used by runInstallFromRequirements');
		},
		async listPackages() {
			return [];
		},
	};

	await syncManifest({
		root: deps.root,
		output: deps.output,
		getPythonPath: deps.getPythonPath,
		// Adapter always runs ensureVenv; flag value is ignored by adapter.
		venvExists: () => false,
		resolveManager: () => adapter,
		withProgress: deps.withProgress,
		showInformationMessage: deps.showInformationMessage,
		showErrorMessage: deps.showErrorMessage,
	});
}
