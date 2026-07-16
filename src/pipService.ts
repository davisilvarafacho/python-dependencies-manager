import type * as vscode from 'vscode';
import { venvPythonPath } from './paths';
import {
	runProcess,
	type ProcessRunner,
	type RunProcessResult,
} from './runProcess';

export type PackageInfo = { name: string; version: string };

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

async function runPip(
	options: PipBaseOptions,
	args: string[],
	action: string,
): Promise<RunProcessResult> {
	const { root, output } = options;
	const run = options.run ?? runProcess;
	const result = await run({
		command: venvPythonPath(root),
		args: ['-m', 'pip', ...args],
		cwd: root,
		output,
	});
	failOnNonZero(result, action);
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
	options: PipBaseOptions & { spec: string },
): Promise<void> {
	await runPip(options, ['install', options.spec], 'install');
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
	await runPip(options, ['install', '-r', 'requirements.txt'], 'install requirements');
}
