import * as fs from 'fs/promises';
import type * as vscode from 'vscode';
import { log } from './log';
import { requirementsTxtPath, venvPythonPath } from './paths';
import {
	runProcess,
	type ProcessRunner,
	type RunProcessResult,
} from './runProcess';
import type { PackageInfo } from './packageManager/types';

export type { PackageInfo } from './packageManager/types';
export type { ProcessRunner };

type PipBaseOptions = {
	root: string;
	output: vscode.OutputChannel;
	run?: ProcessRunner;
};

function failOnNonZero(result: RunProcessResult, action: string): void {
	if (result.code === 0) {
		return;
	}
	const snippet = (result.stderr || result.stdout || '').trim().slice(0, 500);
	throw new Error(
		`pip ${action} failed (exit code ${result.code})${snippet ? `: ${snippet}` : ''}`,
	);
}

/**
 * Ensure the project .venv can run `python -m pip`.
 * Many Debian/Ubuntu venvs are created without pip when ensurepip is missing.
 */
export async function ensurePipAvailable(options: PipBaseOptions): Promise<void> {
	const { root, output } = options;
	const run = options.run ?? runProcess;
	const python = venvPythonPath(root);

	log(output, 'pip', `venv python: ${python}`);
	log(output, 'pip', 'Checking `python -m pip --version`…');

	const check = await run({
		command: python,
		args: ['-m', 'pip', '--version'],
		cwd: root,
		output,
	});

	if (check.code === 0) {
		log(output, 'pip', `pip OK: ${(check.stdout || check.stderr).trim()}`);
		return;
	}

	log(
		output,
		'pip',
		'pip is missing in .venv (common when ensurepip was unavailable). Bootstrapping with ensurepip…',
	);

	const bootstrap = await run({
		command: python,
		args: ['-m', 'ensurepip', '--upgrade'],
		cwd: root,
		output,
	});

	if (bootstrap.code !== 0) {
		const snippet = (bootstrap.stderr || bootstrap.stdout || '').trim().slice(0, 500);
		throw new Error(
			[
				'No module named pip in .venv, and ensurepip failed to install it.',
				snippet ? `Details: ${snippet}` : '',
				'Fix: install system packages, then recreate .venv, e.g.',
				'  sudo apt install python3-venv python3-pip',
				'  rm -rf .venv',
				'  then run Install from requirements.txt again.',
			]
				.filter(Boolean)
				.join(' '),
		);
	}

	log(output, 'pip', 'ensurepip finished; re-checking pip…');
	const recheck = await run({
		command: python,
		args: ['-m', 'pip', '--version'],
		cwd: root,
		output,
	});

	if (recheck.code !== 0) {
		const snippet = (recheck.stderr || recheck.stdout || '').trim().slice(0, 500);
		throw new Error(
			`pip still unavailable after ensurepip${snippet ? `: ${snippet}` : ''}. ` +
				'Recreate .venv after installing python3-venv / python3-pip.',
		);
	}

	log(output, 'pip', `pip ready: ${(recheck.stdout || recheck.stderr).trim()}`);
}

async function runPip(
	options: PipBaseOptions,
	args: string[],
	action: string,
): Promise<RunProcessResult> {
	const { root, output } = options;
	const run = options.run ?? runProcess;

	await ensurePipAvailable(options);

	log(output, 'pip', `Running: python -m pip ${args.join(' ')}`);
	const result = await run({
		command: venvPythonPath(root),
		args: ['-m', 'pip', ...args],
		cwd: root,
		output,
	});
	failOnNonZero(result, action);
	log(output, 'pip', `${action} completed successfully`);
	return result;
}

export async function listPackages(options: PipBaseOptions): Promise<PackageInfo[]> {
	const result = await runPip(options, ['list', '--format=json'], 'list');
	const stdout = result.stdout.trim();
	if (!stdout) {
		return [];
	}
	try {
		const parsed: unknown = JSON.parse(stdout);
		if (!Array.isArray(parsed)) {
			throw new Error('pip list JSON is not an array');
		}
		return parsed.map((item) => {
			const row = item as { name?: unknown; version?: unknown };
			return {
				name: String(row.name ?? ''),
				version: String(row.version ?? ''),
			};
		});
	} catch (err) {
		if (err instanceof Error && err.message.startsWith('pip list')) {
			throw err;
		}
		throw new Error(
			`Failed to parse pip list JSON: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

export async function installPackage(
	options: PipBaseOptions & { spec: string | string[] },
): Promise<void> {
	const specs = (Array.isArray(options.spec) ? options.spec : [options.spec])
		.map((s) => s.trim())
		.filter(Boolean);
	if (specs.length === 0) {
		throw new Error('No package spec provided to install');
	}
	log(options.output, 'pip', `Installing ${specs.length} package(s): ${specs.join(', ')}`);
	await runPip(options, ['install', ...specs], 'install');
}

export async function uninstallPackage(
	options: PipBaseOptions & { name: string },
): Promise<void> {
	await runPip(options, ['uninstall', '-y', options.name], 'uninstall');
}

export async function updatePackage(
	options: PipBaseOptions & { name: string },
): Promise<void> {
	await runPip(options, ['install', '-U', options.name], 'update');
}

export async function installRequirements(options: PipBaseOptions): Promise<void> {
	const { output, root } = options;
	log(output, 'pip', `Installing from ${root}/requirements.txt`);
	await runPip(options, ['install', '-r', 'requirements.txt'], 'install requirements');
}

/**
 * Run `pip freeze` and write the result to workspace-root requirements.txt.
 */
export async function freezeToRequirements(
	options: PipBaseOptions & {
		writeFile?: (filePath: string, content: string) => Promise<void>;
	},
): Promise<string> {
	const { root, output } = options;
	const writeFile = options.writeFile ?? ((p, c) => fs.writeFile(p, c, 'utf8'));
	const target = requirementsTxtPath(root);

	log(output, 'pip', `Running pip freeze → ${target}`);
	const result = await runPip(options, ['freeze'], 'freeze');
	const body = result.stdout.replace(/\r\n/g, '\n');
	const content = body.endsWith('\n') || body.length === 0 ? body : `${body}\n`;

	await writeFile(target, content);
	const lineCount = content ? content.trimEnd().split('\n').length : 0;
	log(output, 'pip', `Wrote ${lineCount} line(s) to ${target}`);
	return target;
}
