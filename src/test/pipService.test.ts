import * as assert from 'assert';
import type * as vscode from 'vscode';
import {
	listPackages,
	installPackage,
	uninstallPackage,
	updatePackage,
	installRequirements,
} from '../pipService';
import type { RunProcessOptions } from '../runProcess';

suite('pipService', () => {
	const output = { appendLine() {}, append() {} } as unknown as vscode.OutputChannel;

	test('listPackages parses json', async () => {
		const pkgs = await listPackages({
			root: '/proj',
			output,
			run: async () => ({
				code: 0,
				stdout: JSON.stringify([
					{ name: 'requests', version: '2.32.0' },
					{ name: 'pip', version: '24.0' },
				]),
				stderr: '',
			}),
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
			run: async () => ({ code: 0, stdout: '', stderr: '' }),
		});
		assert.deepStrictEqual(pkgs, []);
	});

	test('listPackages throws on invalid json', async () => {
		await assert.rejects(() =>
			listPackages({
				root: '/proj',
				output,
				run: async () => ({ code: 0, stdout: 'not-json', stderr: '' }),
			}),
		);
	});

	test('listPackages invokes pip list --format=json', async () => {
		let opts: RunProcessOptions | undefined;
		await listPackages({
			root: '/proj',
			output,
			run: async (o) => {
				opts = o;
				return { code: 0, stdout: '[]', stderr: '' };
			},
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
				run: async () => ({ code: 1, stdout: '', stderr: 'boom' }),
			}),
		);
	});

	test('installPackage uses pip install <spec>', async () => {
		let opts: RunProcessOptions | undefined;
		await installPackage({
			root: '/proj',
			output,
			spec: 'requests==2.32.0',
			run: async (o) => {
				opts = o;
				return { code: 0, stdout: '', stderr: '' };
			},
		});
		assert.deepStrictEqual(opts!.args, ['-m', 'pip', 'install', 'requests==2.32.0']);
	});

	test('uninstallPackage uses pip uninstall -y <name>', async () => {
		let opts: RunProcessOptions | undefined;
		await uninstallPackage({
			root: '/proj',
			output,
			name: 'requests',
			run: async (o) => {
				opts = o;
				return { code: 0, stdout: '', stderr: '' };
			},
		});
		assert.deepStrictEqual(opts!.args, ['-m', 'pip', 'uninstall', '-y', 'requests']);
	});

	test('updatePackage uses pip install -U <name>', async () => {
		let opts: RunProcessOptions | undefined;
		await updatePackage({
			root: '/proj',
			output,
			name: 'requests',
			run: async (o) => {
				opts = o;
				return { code: 0, stdout: '', stderr: '' };
			},
		});
		assert.deepStrictEqual(opts!.args, ['-m', 'pip', 'install', '-U', 'requests']);
	});

	test('installRequirements uses pip install -r requirements.txt', async () => {
		let opts: RunProcessOptions | undefined;
		await installRequirements({
			root: '/proj',
			output,
			run: async (o) => {
				opts = o;
				return { code: 0, stdout: '', stderr: '' };
			},
		});
		assert.deepStrictEqual(opts!.args, ['-m', 'pip', 'install', '-r', 'requirements.txt']);
	});
});
