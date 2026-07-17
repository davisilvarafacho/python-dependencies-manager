import * as vscode from 'vscode';
import { log, logSection } from './log';
import { resolvePackageManager } from './packageManager/resolve';
import type { PackageInfo, PackageManager } from './packageManager/types';
import { InterpreterError } from './pythonInterpreter';

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

type UiDeps = {
	withProgress: typeof vscode.window.withProgress;
	showInformationMessage: typeof vscode.window.showInformationMessage;
	showErrorMessage: typeof vscode.window.showErrorMessage;
};

function resolveUi(deps: PackageOpsDeps): UiDeps {
	return {
		withProgress: deps.withProgress ?? vscode.window.withProgress.bind(vscode.window),
		showInformationMessage:
			deps.showInformationMessage ??
			vscode.window.showInformationMessage.bind(vscode.window),
		showErrorMessage:
			deps.showErrorMessage ?? vscode.window.showErrorMessage.bind(vscode.window),
	};
}

function resolveManager(deps: Pick<PackageOpsDeps, 'root' | 'resolveManager'>): PackageManager {
	return (deps.resolveManager ?? resolvePackageManager)(deps.root);
}

function managerContext(
	deps: Pick<PackageOpsDeps, 'root' | 'output'>,
): { root: string; output: vscode.OutputChannel } {
	return { root: deps.root, output: deps.output };
}

async function handleFlowError(
	err: unknown,
	output: vscode.OutputChannel,
	showErrorMessage: typeof vscode.window.showErrorMessage,
): Promise<void> {
	const message = err instanceof Error ? err.message : String(err);
	log(output, 'flow', `FAILED: ${message}`);
	if (err instanceof Error && err.stack) {
		log(output, 'flow', `stack:\n${err.stack}`);
	}
	await showErrorMessage(message);
	if (!(err instanceof InterpreterError)) {
		output.show(true);
	}
}

function installedToast(specs: string[]): string {
	return specs.length === 1
		? `Installed ${specs[0]}.`
		: `Installed ${specs.length} packages.`;
}

function freezeOfferMessage(specs: string[]): string {
	return specs.length === 1
		? `Installed ${specs[0]}. Update requirements.txt with pip freeze?`
		: `Installed ${specs.length} packages. Update requirements.txt with pip freeze?`;
}

/** Returns true on success, false after UI error handling on failure. */
export async function syncManifest(deps: PackageOpsDeps): Promise<boolean> {
	const ui = resolveUi(deps);
	const manager = resolveManager(deps);
	const { output, root } = deps;
	const ctx = managerContext(deps);

	logSection(output, manager.syncCommandTitle);
	log(output, 'flow', `root: ${root}`);
	log(output, 'flow', `manager: ${manager.id}`);
	output.show(true);

	try {
		await ui.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'Python Dependencies',
				cancellable: false,
			},
			async (progress) => {
				progress.report({ message: 'Resolving Python interpreter…' });
				log(output, 'flow', 'Step 1/3: resolve Python interpreter');
				const pythonPath = await deps.getPythonPath();
				log(output, 'flow', `interpreter: ${pythonPath}`);

				progress.report({ message: 'Ensuring .venv…' });
				log(output, 'flow', 'Step 2/3: ensure .venv');
				const venvResult = await manager.ensureEnv({
					...ctx,
					pythonPath,
					venvAlreadyExists: deps.venvExists(root),
				});
				log(output, 'flow', `ensureEnv result: ${String(venvResult)}`);

				progress.report({
					message:
						manager.id === 'uv'
							? 'Syncing dependencies…'
							: 'Installing from requirements.txt…',
				});
				log(output, 'flow', 'Step 3/3: sync manifest');
				await manager.syncManifest(ctx);
				log(output, 'flow', 'syncManifest finished');
			},
		);

		log(output, 'flow', 'SUCCESS');
		const successMessage =
			manager.id === 'uv'
				? 'Dependencies synced successfully.'
				: 'Dependencies installed successfully.';
		await ui.showInformationMessage(successMessage);
		deps.onRefresh?.();
		return true;
	} catch (err) {
		await handleFlowError(err, output, ui.showErrorMessage);
		return false;
	}
}

export async function addPackages(
	deps: PackageOpsDeps & { specs: string[] },
): Promise<void> {
	const ui = resolveUi(deps);
	const manager = resolveManager(deps);
	const { output, root, specs } = deps;
	const cleaned = [...new Set(specs.map((s) => s.trim()).filter(Boolean))];
	if (cleaned.length === 0) {
		return;
	}

	const ctx = managerContext(deps);
	const label = cleaned.length === 1 ? cleaned[0] : `${cleaned.length} packages`;

	logSection(output, `Install package(s): ${cleaned.join(', ')}`);
	log(output, 'flow', `root: ${root}`);
	log(output, 'flow', `manager: ${manager.id}`);
	output.show(true);

	try {
		await ui.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: `Installing ${label}…`,
				cancellable: false,
			},
			async () => {
				await manager.addPackages({ ...ctx, specs: cleaned });
			},
		);

		deps.onRefresh?.();

		if (manager.afterAddShouldOfferManifestWrite && manager.freezeToManifest) {
			const freezeChoice = await ui.showInformationMessage(
				freezeOfferMessage(cleaned),
				'Yes',
				'No',
			);
			if (freezeChoice === 'Yes') {
				log(output, 'flow', 'User accepted freeze to requirements.txt');
				await ui.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: 'Updating requirements.txt (pip freeze)…',
						cancellable: false,
					},
					async () => {
						await manager.freezeToManifest!({ ...ctx });
					},
				);
				await ui.showInformationMessage('requirements.txt updated with pip freeze.');
			} else {
				log(output, 'flow', 'User declined freeze to requirements.txt');
				await ui.showInformationMessage(installedToast(cleaned));
			}
		} else {
			await ui.showInformationMessage(installedToast(cleaned));
		}

		log(output, 'flow', 'SUCCESS');
	} catch (err) {
		await handleFlowError(err, output, ui.showErrorMessage);
	}
}

export async function removePackage(
	deps: PackageOpsDeps & { name: string },
): Promise<void> {
	const ui = resolveUi(deps);
	const manager = resolveManager(deps);
	const { output, name } = deps;
	const ctx = managerContext(deps);

	logSection(output, `Uninstall package: ${name}`);
	log(output, 'flow', `manager: ${manager.id}`);
	output.show(true);

	try {
		await ui.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: `Uninstalling ${name}…`,
				cancellable: false,
			},
			async () => {
				await manager.removePackage({ ...ctx, name });
			},
		);
		log(output, 'flow', 'SUCCESS');
		await ui.showInformationMessage(`Uninstalled ${name}.`);
		deps.onRefresh?.();
	} catch (err) {
		await handleFlowError(err, output, ui.showErrorMessage);
	}
}

export async function updatePackage(
	deps: PackageOpsDeps & { name: string },
): Promise<void> {
	const ui = resolveUi(deps);
	const manager = resolveManager(deps);
	const { output, name } = deps;
	const ctx = managerContext(deps);

	logSection(output, `Update package: ${name}`);
	log(output, 'flow', `manager: ${manager.id}`);
	output.show(true);

	try {
		await ui.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: `Updating ${name}…`,
				cancellable: false,
			},
			async () => {
				await manager.updatePackage({ ...ctx, name });
			},
		);
		log(output, 'flow', 'SUCCESS');
		await ui.showInformationMessage(`Updated ${name}.`);
		deps.onRefresh?.();
	} catch (err) {
		await handleFlowError(err, output, ui.showErrorMessage);
	}
}

export async function listInstalled(
	deps: Pick<PackageOpsDeps, 'root' | 'output' | 'resolveManager'>,
): Promise<PackageInfo[]> {
	const manager = resolveManager(deps);
	return manager.listPackages(managerContext(deps));
}
