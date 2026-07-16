import { spawn } from 'child_process';
import type * as vscode from 'vscode';
import { log } from './log';

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
	const started = Date.now();
	log(output, 'process', `$ ${command} ${args.join(' ')}`);
	log(output, 'process', `cwd: ${cwd}`);

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
			log(output, 'process', `spawn error: ${err.message}`);
			reject(err);
		});
		child.on('close', (code) => {
			const ms = Date.now() - started;
			log(output, 'process', `exit code: ${code} (${ms}ms)`);
			if (code !== 0) {
				const tail = (stderr || stdout).trim().slice(-800);
				if (tail) {
					log(output, 'process', `failure tail:\n${tail}`);
				}
			}
			resolve({ code, stdout, stderr });
		});
	});
}
