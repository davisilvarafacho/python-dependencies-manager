import type * as vscode from 'vscode';
import { venvDirPath } from './paths';
import { runProcess, type ProcessRunner } from './runProcess';

export type { ProcessRunner };

export async function ensureVenv(options: {
	root: string;
	pythonPath: string;
	output: vscode.OutputChannel;
	venvAlreadyExists: boolean;
	run?: ProcessRunner;
}): Promise<'created' | 'exists'> {
	const { root, pythonPath, output, venvAlreadyExists } = options;
	const run = options.run ?? runProcess;

	if (venvAlreadyExists) {
		output.appendLine('Virtual environment already exists; skipping creation.');
		return 'exists';
	}

	const venvPath = venvDirPath(root);
	const result = await run({
		command: pythonPath,
		args: ['-m', 'venv', venvPath],
		cwd: root,
		output,
	});

	if (result.code !== 0) {
		const snippet = (result.stderr || result.stdout || '').trim().slice(0, 500);
		const ensurepipHint =
			/ensurepip|python3-venv|No module named venv/i.test(snippet)
				? ' Install the venv module for your Python (on Debian/Ubuntu: sudo apt install python3-venv / python3.12-venv).'
				: '';
		throw new Error(
			`Failed to create virtual environment (exit code ${result.code})${
				snippet ? `: ${snippet}` : ''
			}${ensurepipHint}`,
		);
	}

	output.appendLine(`Created virtual environment at ${venvPath}`);
	return 'created';
}
