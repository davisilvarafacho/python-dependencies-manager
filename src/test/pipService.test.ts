import * as assert from 'assert';
import type * as vscode from 'vscode';
import {
	listPackages,
	installPackage,
	uninstallPackage,
	updatePackage,
	installRequirements,
	ensurePipAvailable,
	freezeToRequirements,
} from '../pipService';
import type { ProcessRunner, RunProcessOptions, RunProcessResult } from '../runProcess';

suite('pipService', () => {
	const output = { appendLine() {}, append() {} } as unknown as vscode.OutputChannel;

	/** First call is always `pip --version` from ensurePipAvailable. */
	function withPipReady(
		handler: (opts: RunProcessOptions) => Promise<RunProcessResult> | RunProcessResult,
	): ProcessRunner {
		return async (opts) => {
			if (opts.args.includes('--version')) {
				return { code: 0, stdout: 'pip 24.0', stderr: '' };
			}
			return handler(opts);
		};
	}

	test('listPackages parses json', async () => {
		const pkgs = await listPackages({
			root: '/proj',
			output,
			run: withPipReady(async () => ({
				code: 0,
				stdout: JSON.stringify([
					{ name: 'requests', version: '2.32.0' },
					{ name: 'pip', version: '24.0' },
				]),
				stderr: '',
			})),
		});
		assert.deepStrictEqual(pkgs, [
			{ name: 'requests', version: '2.32.0' },
			{ name: 'pip', version: '24.0' },
		]);
	});

	test('listPackages returns empty array on empty stdout', async () => {
		const pkgs = await listPackages({
			root: '/proj',
			output,
			run: withPipReady(async () => ({ code: 0, stdout: '', stderr: '' })),
		});
		assert.deepStrictEqual(pkgs, []);
	});

	test('listPackages throws on invalid json', async () => {
		await assert.rejects(() =>
			listPackages({
				root: '/proj',
				output,
				run: withPipReady(async () => ({ code: 0, stdout: 'not-json', stderr: '' })),
			}),
		);
	});

	test('listPackages invokes pip list --format=json', async () => {
		let opts: RunProcessOptions | undefined;
		await listPackages({
			root: '/proj',
			output,
			run: withPipReady(async (o) => {
				opts = o;
				return { code: 0, stdout: '[]', stderr: '' };
			}),
		});
		assert.ok(opts);
		assert.ok(opts!.command.includes('python') || opts!.command.endsWith('python'));
		assert.deepStrictEqual(opts!.args, ['-m', 'pip', 'list', '--format=json']);
		assert.strictEqual(opts!.cwd, '/proj');
	});

	test('installPackage throws on non-zero', async () => {
		await assert.rejects(() =>
			installPackage({
				root: '/proj',
				output,
				spec: 'nope',
				run: withPipReady(async () => ({ code: 1, stdout: '', stderr: 'boom' })),
			}),
		);
	});

	test('installPackage uses pip install <spec>', async () => {
		let opts: RunProcessOptions | undefined;
		await installPackage({
			root: '/proj',
			output,
			spec: 'requests==2.32.0',
			run: withPipReady(async (o) => {
				opts = o;
				return { code: 0, stdout: '', stderr: '' };
			}),
		});
		assert.deepStrictEqual(opts!.args, ['-m', 'pip', 'install', 'requests==2.32.0']);
	});

	test('uninstallPackage uses pip uninstall -y <name>', async () => {
		let opts: RunProcessOptions | undefined;
		await uninstallPackage({
			root: '/proj',
			output,
			name: 'requests',
			run: withPipReady(async (o) => {
				opts = o;
				return { code: 0, stdout: '', stderr: '' };
			}),
		});
		assert.deepStrictEqual(opts!.args, ['-m', 'pip', 'uninstall', '-y', 'requests']);
	});

	test('updatePackage uses pip install -U <name>', async () => {
		let opts: RunProcessOptions | undefined;
		await updatePackage({
			root: '/proj',
			output,
			name: 'requests',
			run: withPipReady(async (o) => {
				opts = o;
				return { code: 0, stdout: '', stderr: '' };
			}),
		});
		assert.deepStrictEqual(opts!.args, ['-m', 'pip', 'install', '-U', 'requests']);
	});

	test('installRequirements uses pip install -r requirements.txt', async () => {
		let opts: RunProcessOptions | undefined;
		await installRequirements({
			root: '/proj',
			output,
			run: withPipReady(async (o) => {
				opts = o;
				return { code: 0, stdout: '', stderr: '' };
			}),
		});
		assert.deepStrictEqual(opts!.args, [
			'-m',
			'pip',
			'install',
			'-r',
			'requirements.txt',
		]);
	});

	test('ensurePipAvailable bootstraps with ensurepip when pip missing', async () => {
		const calls: string[][] = [];
		await ensurePipAvailable({
			root: '/proj',
			output,
			run: async (o) => {
				calls.push(o.args);
				if (o.args.includes('--version') && calls.filter((c) => c.includes('--version')).length === 1) {
					return { code: 1, stdout: '', stderr: 'No module named pip' };
				}
				if (o.args.includes('ensurepip')) {
					return { code: 0, stdout: 'Looking in links…', stderr: '' };
				}
				if (o.args.includes('--version')) {
					return { code: 0, stdout: 'pip 24.0 from …', stderr: '' };
				}
				return { code: 1, stdout: '', stderr: 'unexpected' };
			},
		});
		assert.ok(calls.some((a) => a.includes('ensurepip')));
		assert.strictEqual(calls.filter((c) => c.includes('--version')).length, 2);
	});

	test('freezeToRequirements runs pip freeze and writes requirements.txt', async () => {
		let writtenPath = '';
		let writtenContent = '';
		let freezeArgs: string[] | undefined;

		const target = await freezeToRequirements({
			root: '/proj',
			output,
			run: withPipReady(async (o) => {
				freezeArgs = o.args;
				return {
					code: 0,
					stdout: 'requests==2.32.0\nsix==1.16.0',
					stderr: '',
				};
			}),
			writeFile: async (filePath, content) => {
				writtenPath = filePath;
				writtenContent = content;
			},
		});

		assert.deepStrictEqual(freezeArgs, ['-m', 'pip', 'freeze']);
		assert.ok(writtenPath.endsWith('requirements.txt'));
		assert.strictEqual(writtenContent, 'requests==2.32.0\nsix==1.16.0\n');
		assert.strictEqual(target, writtenPath);
	});
});
