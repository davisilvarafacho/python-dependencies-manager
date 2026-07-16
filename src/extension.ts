import * as vscode from 'vscode';
import { runInstallFromRequirements } from './installFlow';
import { createOutputChannel } from './output';
import { PackageItem, PackagesTreeProvider } from './packagesTree';
import { requirementsExists, venvExists } from './paths';
import {
	installPackage as pipInstallPackage,
	installRequirements,
	listPackages,
	uninstallPackage as pipUninstallPackage,
	updatePackage as pipUpdatePackage,
} from './pipService';
import { PromptPreferences } from './preferences';
import { maybePromptInstallFromRequirements } from './promptInstall';
import { getSelectedPythonPath } from './pythonInterpreter';
import { ensureVenv } from './venvService';
import { getWorkspaceRootFsPath } from './workspaceRoot';

/**
 * Entry point. MVP behavior is defined in:
 * docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md
 */
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

	const requireRoot = (): string | undefined => {
		const root = getWorkspaceRootFsPath();
		if (!root) {
			void vscode.window.showErrorMessage('Open a folder workspace first.');
			return undefined;
		}
		return root;
	};

	const reportError = (err: unknown): void => {
		const message = err instanceof Error ? err.message : String(err);
		void vscode.window.showErrorMessage(message);
		output.show(true);
	};

	const installFromRequirements = async () => {
		const root = requireRoot();
		if (!root) {
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
			ensureVenv: async ({ root: r, pythonPath }) =>
				ensureVenv({
					root: r,
					pythonPath,
					output,
					venvAlreadyExists: venvExists(r),
				}),
			installRequirements: async () => installRequirements({ root, output }),
		});
		tree.refresh();
	};

	const refreshPackages = async () => {
		tree.refresh();
	};

	const installPackageCmd = async () => {
		const root = requireRoot();
		if (!root) {
			return;
		}
		if (!venvExists(root)) {
			void vscode.window.showErrorMessage(
				'No .venv found. Install from requirements.txt first.',
			);
			return;
		}

		const spec = await vscode.window.showInputBox({
			prompt: 'Package name or pip spec (e.g. requests, requests==2.31.0)',
			placeHolder: 'package-name',
		});
		if (!spec?.trim()) {
			return;
		}

		try {
			await pipInstallPackage({ root, output, spec: spec.trim() });
			tree.refresh();
		} catch (err) {
			reportError(err);
		}
	};

	const uninstallPackageCmd = async (item?: PackageItem) => {
		if (!item?.pkg?.name) {
			void vscode.window.showErrorMessage('Select a package in the Packages view.');
			return;
		}
		const root = requireRoot();
		if (!root) {
			return;
		}
		if (!venvExists(root)) {
			void vscode.window.showErrorMessage(
				'No .venv found. Install from requirements.txt first.',
			);
			return;
		}

		try {
			await pipUninstallPackage({ root, output, name: item.pkg.name });
			tree.refresh();
		} catch (err) {
			reportError(err);
		}
	};

	const updatePackageCmd = async (item?: PackageItem) => {
		if (!item?.pkg?.name) {
			void vscode.window.showErrorMessage('Select a package in the Packages view.');
			return;
		}
		const root = requireRoot();
		if (!root) {
			return;
		}
		if (!venvExists(root)) {
			void vscode.window.showErrorMessage(
				'No .venv found. Install from requirements.txt first.',
			);
			return;
		}

		try {
			await pipUpdatePackage({ root, output, name: item.pkg.name });
			tree.refresh();
		} catch (err) {
			reportError(err);
		}
	};

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'pythonDependenciesManager.installFromRequirements',
			installFromRequirements,
		),
		vscode.commands.registerCommand(
			'pythonDependenciesManager.refreshPackages',
			refreshPackages,
		),
		vscode.commands.registerCommand(
			'pythonDependenciesManager.installPackage',
			installPackageCmd,
		),
		vscode.commands.registerCommand(
			'pythonDependenciesManager.uninstallPackage',
			uninstallPackageCmd,
		),
		vscode.commands.registerCommand(
			'pythonDependenciesManager.updatePackage',
			updatePackageCmd,
		),
	);

	void maybePromptInstallFromRequirements({
		root: getWorkspaceRootFsPath(),
		preferences,
		requirementsExists: (() => {
			const r = getWorkspaceRootFsPath();
			return r ? requirementsExists(r) : false;
		})(),
		onInstall: installFromRequirements,
	});

	output.appendLine('Python Dependencies Manager activated.');
}

export function deactivate() {}
