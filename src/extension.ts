import * as vscode from 'vscode';
import { runInstallFromRequirements } from './installFlow';
import { log, logSection } from './log';
import { createOutputChannel } from './output';
import { pickPackageToInstall } from './packageInstallQuickPick';
import { NoVenvError } from './packagesTree';
import { PackagesWebviewProvider } from './packagesWebview';
import { requirementsExists, venvExists } from './paths';
import {
	freezeToRequirements,
	installPackage as pipInstallPackage,
	installRequirements,
	listPackages,
	uninstallPackage as pipUninstallPackage,
	updatePackage as pipUpdatePackage,
	type PackageInfo,
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
	const rootAtActivate = getWorkspaceRootFsPath();
	logSection(output, 'Extension activate');
	log(output, 'activate', `workspace root: ${rootAtActivate ?? '(none)'}`);
	log(
		output,
		'activate',
		`requirements.txt: ${rootAtActivate ? requirementsExists(rootAtActivate) : false}`,
	);
	log(output, 'activate', `.venv: ${rootAtActivate ? venvExists(rootAtActivate) : false}`);

	const loadPackages = async (): Promise<PackageInfo[]> => {
		const root = getWorkspaceRootFsPath();
		if (!root || !venvExists(root)) {
			log(output, 'tree', `no venv (root=${root ?? 'none'})`);
			throw new NoVenvError('No .venv found — run Install from requirements.txt');
		}
		log(output, 'tree', `listing packages in ${root}`);
		try {
			const pkgs = await listPackages({ root, output });
			log(output, 'tree', `listed ${pkgs.length} package(s)`);
			return pkgs;
		} catch (err) {
			log(output, 'tree', `list failed: ${err instanceof Error ? err.message : String(err)}`);
			throw err;
		}
	};

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
		log(output, 'error', message);
		if (err instanceof Error && err.stack) {
			log(output, 'error', err.stack);
		}
		void vscode.window.showErrorMessage(message);
		output.show(true);
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

	// Forward declaration via mutable ref so webview actions can call install flow.
	const packagesViewRef: { current?: PackagesWebviewProvider } = {};

	const installFromRequirements = async () => {
		const root = requireRoot();
		if (!root) {
			return;
		}
		if (!requirementsExists(root)) {
			log(output, 'cmd', 'Install from requirements: missing requirements.txt');
			void vscode.window.showWarningMessage('No requirements.txt at workspace root.');
			return;
		}
		log(output, 'cmd', 'Install from requirements: starting');
		await runInstallFromRequirements({
			root,
			output,
			getPythonPath: async () => {
				log(output, 'cmd', 'resolving interpreter via ms-python.python…');
				const path = await getSelectedPythonPath();
				log(output, 'cmd', `resolved interpreter: ${path}`);
				return path;
			},
			ensureVenv: async ({ root: r, pythonPath }) =>
				ensureVenv({
					root: r,
					pythonPath,
					output,
					venvAlreadyExists: venvExists(r),
				}),
			installRequirements: async () => installRequirements({ root, output }),
		});
		packagesViewRef.current?.refresh();
		log(output, 'cmd', 'Install from requirements: done (view refreshed)');
	};

	const offerNoVenvRecovery = async (): Promise<void> => {
		const choice = await vscode.window.showErrorMessage(
			'No .venv found. Install from requirements.txt first.',
			INSTALL_FROM_REQUIREMENTS_ACTION,
		);
		if (choice === INSTALL_FROM_REQUIREMENTS_ACTION) {
			await installFromRequirements();
		}
	};

	const refreshPackages = async () => {
		await packagesViewRef.current?.reload();
	};

	const installSpecAndMaybeFreeze = async (
		spec: string,
		versionHint?: string,
	): Promise<void> => {
		const root = requireRoot();
		if (!root) {
			return;
		}
		if (!venvExists(root)) {
			await offerNoVenvRecovery();
			return;
		}

		try {
			logSection(output, `Install package: ${spec}`);
			if (versionHint) {
				log(output, 'cmd', `PyPI latest version shown: ${versionHint}`);
			}
			output.show(true);
			await withPackageProgress(`Installing ${spec}…`, async () => {
				await pipInstallPackage({ root, output, spec });
			});
			packagesViewRef.current?.refresh();

			const freezeChoice = await vscode.window.showInformationMessage(
				`Installed ${spec}. Update requirements.txt with pip freeze?`,
				'Yes',
				'No',
			);
			if (freezeChoice === 'Yes') {
				log(output, 'cmd', 'User accepted freeze to requirements.txt');
				await withPackageProgress('Updating requirements.txt (pip freeze)…', async () => {
					await freezeToRequirements({ root, output });
				});
				void vscode.window.showInformationMessage(
					'requirements.txt updated with pip freeze.',
				);
			} else {
				log(output, 'cmd', 'User declined freeze to requirements.txt');
				void vscode.window.showInformationMessage(`Installed ${spec}.`);
			}
		} catch (err) {
			reportError(err);
		}
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

		const picked = await pickPackageToInstall();
		if (!picked?.spec?.trim()) {
			return;
		}
		await installSpecAndMaybeFreeze(picked.spec.trim(), picked.version);
	};

	const installNamedPackage = async (spec: string) => {
		const trimmed = spec.trim();
		if (!trimmed) {
			return;
		}
		await installSpecAndMaybeFreeze(trimmed);
	};

	const uninstallPackageByName = async (name: string) => {
		const root = requireRoot();
		if (!root) {
			return;
		}
		if (!venvExists(root)) {
			await offerNoVenvRecovery();
			return;
		}

		const confirm = await vscode.window.showWarningMessage(
			`Uninstall ${name}?`,
			{ modal: true },
			'Confirm',
		);
		if (confirm !== 'Confirm') {
			return;
		}

		try {
			logSection(output, `Uninstall package: ${name}`);
			output.show(true);
			await withPackageProgress(`Uninstalling ${name}…`, async () => {
				await pipUninstallPackage({ root, output, name });
			});
			packagesViewRef.current?.refresh();
			void vscode.window.showInformationMessage(`Uninstalled ${name}.`);
		} catch (err) {
			reportError(err);
		}
	};

	const updatePackageByName = async (name: string) => {
		const root = requireRoot();
		if (!root) {
			return;
		}
		if (!venvExists(root)) {
			await offerNoVenvRecovery();
			return;
		}

		try {
			logSection(output, `Update package: ${name}`);
			output.show(true);
			await withPackageProgress(`Updating ${name}…`, async () => {
				await pipUpdatePackage({ root, output, name });
			});
			packagesViewRef.current?.refresh();
			void vscode.window.showInformationMessage(`Updated ${name}.`);
		} catch (err) {
			reportError(err);
		}
	};

	const packagesView = new PackagesWebviewProvider(context.extensionUri, loadPackages, {
		refresh: refreshPackages,
		installPackage: installPackageCmd,
		installFromRequirements,
		installNamedPackage,
		updatePackage: updatePackageByName,
		uninstallPackage: uninstallPackageByName,
	});
	packagesViewRef.current = packagesView;

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(PackagesWebviewProvider.viewType, packagesView, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
	);

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
			async (arg?: { pkg?: PackageInfo } | string) => {
				const name =
					typeof arg === 'string' ? arg : arg?.pkg?.name;
				if (!name) {
					void vscode.window.showErrorMessage('Select a package in the Packages view.');
					return;
				}
				await uninstallPackageByName(name);
			},
		),
		vscode.commands.registerCommand(
			'pythonDependenciesManager.updatePackage',
			async (arg?: { pkg?: PackageInfo } | string) => {
				const name =
					typeof arg === 'string' ? arg : arg?.pkg?.name;
				if (!name) {
					void vscode.window.showErrorMessage('Select a package in the Packages view.');
					return;
				}
				await updatePackageByName(name);
			},
		),
	);

	void maybePromptInstallFromRequirements({
		root: getWorkspaceRootFsPath(),
		preferences,
		requirementsExists: (() => {
			const r = getWorkspaceRootFsPath();
			return r ? requirementsExists(r) : false;
		})(),
		venvExists: (() => {
			const r = getWorkspaceRootFsPath();
			return r ? venvExists(r) : false;
		})(),
		onInstall: installFromRequirements,
	});

	output.appendLine('Python Dependencies Manager activated.');
}

export function deactivate() {}
