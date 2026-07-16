import * as vscode from 'vscode';
import { InterpreterError } from './pythonInterpreter';

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

export async function runInstallFromRequirements(
	deps: RunInstallFromRequirementsDeps,
): Promise<void> {
	const withProgress = deps.withProgress ?? vscode.window.withProgress.bind(vscode.window);
	const showInformationMessage =
		deps.showInformationMessage ??
		vscode.window.showInformationMessage.bind(vscode.window);
	const showErrorMessage =
		deps.showErrorMessage ?? vscode.window.showErrorMessage.bind(vscode.window);

	try {
		await withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'Python Dependencies',
				cancellable: false,
			},
			async (progress) => {
				progress.report({ message: 'Resolving Python interpreter…' });
				const pythonPath = await deps.getPythonPath();

				progress.report({ message: 'Ensuring .venv…' });
				await deps.ensureVenv({ root: deps.root, pythonPath });

				progress.report({ message: 'Installing from requirements.txt…' });
				await deps.installRequirements();
			},
		);

		await showInformationMessage('Dependencies installed successfully.');
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await showErrorMessage(message);
		if (!(err instanceof InterpreterError)) {
			deps.output.show(true);
		}
	}
}
