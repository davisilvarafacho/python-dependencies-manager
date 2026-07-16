import * as vscode from 'vscode';
import { runInstallFromRequirements } from './installFlow';
import { log, logSection } from './log';
import { createOutputChannel } from './output';
import { pickPackagesToInstall } from './packageInstallQuickPick';
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

	const installSpecsAndMaybeFreeze = async (specs: string[]): Promise<void> => {
		const cleaned = [...new Set(specs.map((s) => s.trim()).filter(Boolean))];
		if (cleaned.length === 0) {
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

		const label =
			cleaned.length === 1 ? cleaned[0] : `${cleaned.length} packages`;

		try {
			logSection(output, `Install package(s): ${cleaned.join(', ')}`);
			output.show(true);
			await withPackageProgress(`Installing ${label}…`, async () => {
				await pipInstallPackage({ root, output, spec: cleaned });
			});
			packagesViewRef.current?.refresh();

			const freezeChoice = await vscode.window.showInformationMessage(
				cleaned.length === 1
					? `Installed ${cleaned[0]}. Update requirements.txt with pip freeze?`
					: `Installed ${cleaned.length} packages. Update requirements.txt with pip freeze?`,
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
				void vscode.window.showInformationMessage(
					cleaned.length === 1
						? `Installed ${cleaned[0]}.`
						: `Installed ${cleaned.length} packages.`,
				);
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

		// Hide packages already in the venv from PyPI multi-select results.
		let excludeNames = new Set<string>();
		try {
			const installed = await listPackages({ root, output });
			excludeNames = new Set(installed.map((p) => p.name.toLowerCase()));
			log(output, 'cmd', `Install picker excludes ${excludeNames.size} installed package(s)`);
		} catch (err) {
			log(
				output,
				'cmd',
				`Could not list installed packages for exclude: ${
					err instanceof Error ? err.message : String(err)
				}`,
			);
		}

		const picked = await pickPackagesToInstall({
			excludeNames,
			onSearchError: (message) => {
				log(output, 'pypi', `search error: ${message}`);
				output.show(true);
			},
		});
		if (!picked?.length) {
			return;
		}
		await installSpecsAndMaybeFreeze(picked.map((p) => p.spec));
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
