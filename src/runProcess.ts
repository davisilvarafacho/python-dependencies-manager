import { spawn } from 'child_process';
import type * as vscode from 'vscode';

export type RunProcessResult = {
	code: number | null;
	stdout: string;
	stderr: string;
};

export type RunProcessOptions = {
	command: string;
	args: string[];
	cwd: string;
	output: vscode.OutputChannel;
};

/** Injectable process runner for tests and alternate backends. */
export type ProcessRunner = (
	options: RunProcessOptions,
) => Promise<RunProcessResult>;

export function runProcess(options: RunProcessOptions): Promise<RunProcessResult> {
	const { command, args, cwd, output } = options;
	output.appendLine(`$ ${command} ${args.join(' ')}`);
	output.appendLine(`cwd: ${cwd}`);

	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			shell: false,
			env: process.env,
		});

		let stdout = '';
		let stderr = '';

		child.stdout.on('data', (chunk: Buffer) => {
			const text = chunk.toString();
			stdout += text;
			output.append(text);
		});
		child.stderr.on('data', (chunk: Buffer) => {
			const text = chunk.toString();
			stderr += text;
			output.append(text);
		});
		child.on('error', (err) => {
			output.appendLine(`Process error: ${err.message}`);
			reject(err);
		});
		child.on('close', (code) => {
			output.appendLine(`exit code: ${code}`);
			resolve({ code, stdout, stderr });
		});
	});
}
