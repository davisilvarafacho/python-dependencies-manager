import { log } from '../log';
import {
	runProcess,
	type ProcessRunner,
	type RunProcessResult,
} from '../runProcess';
import type { ManagerContext, PackageInfo, PackageManager } from './types';

function failOnNonZero(result: RunProcessResult, action: string): void {
	if (result.code === 0) {
		return;
	}
	const snippet = (result.stderr || result.stdout || '').trim().slice(0, 500);
	throw new Error(
		`uv ${action} failed (exit code ${result.code})${snippet ? `: ${snippet}` : ''}`,
	);
}

function runner(ctx: ManagerContext): ProcessRunner {
	return ctx.run ?? runProcess;
}

async function runUv(
	ctx: ManagerContext,
	args: string[],
	action: string,
): Promise<RunProcessResult> {
	const { root, output } = ctx;
	const run = runner(ctx);

	log(output, 'uv', `Running: uv ${args.join(' ')}`);
	const result = await run({
		command: 'uv',
		args,
		cwd: root,
		output,
	});
	failOnNonZero(result, action);
	log(output, 'uv', `${action} completed successfully`);
	return result;
}

export function createUvManager(): PackageManager {
	return {
		id: 'uv',
		syncCommandTitle: 'Sync dependencies',
		manifestKind: 'pyproject.toml',
		afterAddShouldOfferManifestWrite: false,

		async ensureEnv(ctx) {
			const { root, output, pythonPath, venvAlreadyExists } = ctx;
			if (venvAlreadyExists) {
				log(output, 'uv', '`.venv` already exists; skipping `uv venv`');
				return 'exists';
			}

			await runUv(ctx, ['venv', '--python', pythonPath], 'venv');
			log(output, 'uv', `Created .venv at ${root} with python ${pythonPath}`);
			return 'created';
		},

		async syncManifest(ctx) {
			await runUv(ctx, ['sync'], 'sync');
		},

		async addPackages(ctx) {
			const specs = ctx.specs.map((s) => s.trim()).filter(Boolean);
			if (specs.length === 0) {
				throw new Error('No package spec provided to add');
			}
			log(ctx.output, 'uv', `Adding ${specs.length} package(s): ${specs.join(', ')}`);
			await runUv(ctx, ['add', ...specs], 'add');
		},

		async removePackage(ctx) {
			await runUv(ctx, ['remove', ctx.name], 'remove');
		},

		async updatePackage(ctx) {
			await runUv(ctx, ['lock', '--upgrade-package', ctx.name], 'lock');
			await runUv(ctx, ['sync'], 'sync');
		},

		async listPackages(ctx): Promise<PackageInfo[]> {
			const result = await runUv(ctx, ['pip', 'list', '--format=json'], 'list');
			const stdout = result.stdout.trim();
			if (!stdout) {
				return [];
			}
			try {
				const parsed: unknown = JSON.parse(stdout);
				if (!Array.isArray(parsed)) {
					throw new Error('uv pip list JSON is not an array');
				}
				return parsed.map((item) => {
					const row = item as { name?: unknown; version?: unknown };
					return {
						name: String(row.name ?? ''),
						version: String(row.version ?? ''),
					};
				});
			} catch (err) {
				if (err instanceof Error && err.message.startsWith('uv pip list')) {
					throw err;
				}
				throw new Error(
					`Failed to parse uv pip list JSON: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		},
	};
}
