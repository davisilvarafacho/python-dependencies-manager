import * as vscode from 'vscode';
import { runInstallFromRequirements } from './installFlow';
import { createOutputChannel } from './output';
import { NoVenvError, PackageItem, PackagesTreeProvider } from './packagesTree';
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

const INSTALL_FROM_REQUIREMENTS_ACTION = 'Install from requirements.txt';

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
			throw new NoVenvError();
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

	/** When .venv is missing, offer recovery via Install from requirements.txt. */
	const offerNoVenvRecovery = async (): Promise<void> => {
		const choice = await vscode.window.showErrorMessage(
			'No .venv found. Install from requirements.txt first.',
			INSTALL_FROM_REQUIREMENTS_ACTION,
		);
		if (choice === INSTALL_FROM_REQUIREMENTS_ACTION) {
			await installFromRequirements();
		}
	};

	const withPackageProgress = async (
		message: string,
		task: () => Promise<void>,
	): Promise<void> => {
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'Python Dependencies',
				cancellable: false,
			},
			async (progress) => {
				progress.report({ message });
				await task();
			},
		);
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
			await offerNoVenvRecovery();
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
			await withPackageProgress(`Installing ${spec.trim()}…`, async () => {
				await pipInstallPackage({ root, output, spec: spec.trim() });
			});
			tree.refresh();
			void vscode.window.showInformationMessage(`Installed ${spec.trim()}.`);
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
			await offerNoVenvRecovery();
			return;
		}

		const name = item.pkg.name;
		const confirm = await vscode.window.showWarningMessage(
			`Uninstall ${name}?`,
			{ modal: true },
			'Confirm',
		);
		if (confirm !== 'Confirm') {
			return;
		}

		try {
			await withPackageProgress(`Uninstalling ${name}…`, async () => {
				await pipUninstallPackage({ root, output, name });
			});
			tree.refresh();
			void vscode.window.showInformationMessage(`Uninstalled ${name}.`);
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
			await offerNoVenvRecovery();
			return;
		}

		const name = item.pkg.name;
		try {
			await withPackageProgress(`Updating ${name}…`, async () => {
				await pipUpdatePackage({ root, output, name });
			});
			tree.refresh();
			void vscode.window.showInformationMessage(`Updated ${name}.`);
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
