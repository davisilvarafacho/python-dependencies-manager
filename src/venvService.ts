import type * as vscode from 'vscode';
import { log } from './log';
import { venvDirPath, venvPythonPath } from './paths';
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
	const venvPath = venvDirPath(root);

	log(output, 'venv', `workspace root: ${root}`);
	log(output, 'venv', `base interpreter: ${pythonPath}`);
	log(output, 'venv', `target .venv path: ${venvPath}`);
	log(output, 'venv', `already exists: ${venvAlreadyExists}`);

	if (venvAlreadyExists) {
		log(output, 'venv', `reusing existing venv python: ${venvPythonPath(root)}`);
		log(output, 'venv', 'Skipping creation.');
		return 'exists';
	}

	log(output, 'venv', `Creating with: ${pythonPath} -m venv ${venvPath}`);
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
		log(output, 'venv', `creation failed (code ${result.code})`);
		throw new Error(
			`Failed to create virtual environment (exit code ${result.code})${
				snippet ? `: ${snippet}` : ''
			}${ensurepipHint}`,
		);
	}

	log(output, 'venv', `Created virtual environment at ${venvPath}`);
	log(output, 'venv', `venv python: ${venvPythonPath(root)}`);
	return 'created';
}
