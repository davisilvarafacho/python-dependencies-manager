import * as vscode from 'vscode';
import { log, logSection } from './log';
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

	const { output, root } = deps;
	logSection(output, 'Install from requirements.txt');
	log(output, 'flow', `root: ${root}`);
	// Open Output Channel so the user can follow progress live.
	output.show(true);

	try {
		await withProgress(
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
				const venvResult = await deps.ensureVenv({ root: deps.root, pythonPath });
				log(output, 'flow', `ensureVenv result: ${String(venvResult)}`);

				progress.report({ message: 'Installing from requirements.txt…' });
				log(
					output,
					'flow',
					'Step 3/3: ensure pip in .venv (if needed) + pip install -r requirements.txt',
				);
				await deps.installRequirements();
				log(output, 'flow', 'installRequirements finished');
			},
		);

		log(output, 'flow', 'SUCCESS');
		await showInformationMessage('Dependencies installed successfully.');
	} catch (err) {
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
}
