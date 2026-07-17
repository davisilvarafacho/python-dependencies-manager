import * as vscode from 'vscode';
import { log, logSection } from './log';
import { createOutputChannel } from './output';
import { pickPackagesToInstall } from './packageInstallQuickPick';
import { resolvePackageManager } from './packageManager/resolve';
import type { PackageInfo } from './packageManager/types';
import * as packageOps from './packageOps';
import { NoVenvError } from './packagesTree';
import { PackagesWebviewProvider } from './packagesWebview';
import { pyprojectExists, requirementsExists, venvExists } from './paths';
import { PromptPreferences } from './preferences';
import { maybePromptInstallFromRequirements } from './promptInstall';
import { getSelectedPythonPath } from './pythonInterpreter';
import { getWorkspaceRootFsPath } from './workspaceRoot';

function updateBackendContext(root: string | undefined): void {
	const isUv = root ? resolvePackageManager(root).id === 'uv' : false;
	void vscode.commands.executeCommand('setContext', 'pythonDependenciesManager.isUv', isUv);
}

/**
 * Entry point. Dual pip/uv backends via packageOps + resolvePackageManager.
 * Specs: docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md
 *        docs/superpowers/specs/2026-07-17-uv-native-package-manager-design.md
 */
export function activate(context: vscode.ExtensionContext) {
	const output = createOutputChannel();
	context.subscriptions.push(output);

	const preferences = new PromptPreferences(context);
	const rootAtActivate = getWorkspaceRootFsPath();
	updateBackendContext(rootAtActivate);
	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			updateBackendContext(getWorkspaceRootFsPath());
		}),
	);

	logSection(output, 'Extension activate');
	log(output, 'activate', `workspace root: ${rootAtActivate ?? '(none)'}`);
	const managerAtActivate = rootAtActivate
		? resolvePackageManager(rootAtActivate)
		: undefined;
	log(output, 'activate', `package manager: ${managerAtActivate?.id ?? '(none)'}`);
	log(
		output,
		'activate',
		`requirements.txt: ${rootAtActivate ? requirementsExists(rootAtActivate) : false}`,
	);
	log(
		output,
		'activate',
		`pyproject.toml: ${rootAtActivate ? pyprojectExists(rootAtActivate) : false}`,
	);
	log(output, 'activate', `.venv: ${rootAtActivate ? venvExists(rootAtActivate) : false}`);

	const packagesViewRef: { current?: PackagesWebviewProvider } = {};

	const loadPackages = async (): Promise<PackageInfo[]> => {
		const root = getWorkspaceRootFsPath();
		if (!root || !venvExists(root)) {
			const syncTitle = root
				? resolvePackageManager(root).syncCommandTitle
				: 'Install from requirements.txt';
			log(output, 'tree', `no venv (root=${root ?? 'none'})`);
			throw new NoVenvError(`No .venv found — run ${syncTitle}`);
		}
		log(output, 'tree', `listing packages in ${root}`);
		try {
			const pkgs = await packageOps.listInstalled({ root, output });
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

	const syncOrInstall = async () => {
		const root = requireRoot();
		if (!root) {
			return;
		}
		const manager = resolvePackageManager(root);
		if (manager.id === 'pip' && !requirementsExists(root)) {
			log(output, 'cmd', 'Sync/install: missing requirements.txt');
			void vscode.window.showWarningMessage('No requirements.txt at workspace root.');
			return;
		}
		if (manager.id === 'uv' && !pyprojectExists(root)) {
			log(output, 'cmd', 'Sync/install: missing pyproject.toml');
			void vscode.window.showWarningMessage('No pyproject.toml at workspace root.');
			return;
		}
		log(output, 'cmd', `${manager.syncCommandTitle}: starting (manager=${manager.id})`);
		const ok = await packageOps.syncManifest({
			root,
			output,
			getPythonPath: () => getSelectedPythonPath(),
			venvExists,
			onRefresh: () => packagesViewRef.current?.refresh(),
		});
		if (ok) {
			log(output, 'cmd', `${manager.syncCommandTitle}: done`);
		}
	};

	const offerNoVenvRecovery = async (): Promise<void> => {
		const root = getWorkspaceRootFsPath();
		const syncTitle = root
			? resolvePackageManager(root).syncCommandTitle
			: 'Install from requirements.txt';
		const choice = await vscode.window.showErrorMessage(
			`No .venv found. ${syncTitle} first.`,
			syncTitle,
		);
		if (choice === syncTitle) {
			await syncOrInstall();
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

		await packageOps.addPackages({
			root,
			output,
			getPythonPath: () => getSelectedPythonPath(),
			venvExists,
			specs: cleaned,
			onRefresh: () => packagesViewRef.current?.refresh(),
		});
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
			const installed = await packageOps.listInstalled({ root, output });
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
			cacheDir: context.globalStorageUri.fsPath,
			onSearchInfo: (message) => {
				log(output, 'pypi', message);
			},
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

		await packageOps.removePackage({
			root,
			output,
			getPythonPath: () => getSelectedPythonPath(),
			venvExists,
			name,
			onRefresh: () => packagesViewRef.current?.refresh(),
		});
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

		await packageOps.updatePackage({
			root,
			output,
			getPythonPath: () => getSelectedPythonPath(),
			venvExists,
			name,
			onRefresh: () => packagesViewRef.current?.refresh(),
		});
	};

	const packagesView = new PackagesWebviewProvider(context.extensionUri, loadPackages, {
		refresh: refreshPackages,
		installPackage: installPackageCmd,
		installFromRequirements: syncOrInstall,
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
			syncOrInstall,
		),
		vscode.commands.registerCommand(
			'pythonDependenciesManager.syncDependencies',
			syncOrInstall,
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

	output.appendLine('Python Dependencies Manager activated.');
}

export function deactivate() {}
