import * as assert from 'assert';
import type * as vscode from 'vscode';
import { createUvManager } from '../../packageManager/uvManager';
import { venvPythonPath } from '../../paths';
import type { ProcessRunner } from '../../runProcess';

function fakeOutput(): vscode.OutputChannel {
	return {
		append: () => {},
		appendLine: () => {},
	} as unknown as vscode.OutputChannel;
}

suite('uvManager', () => {
	const root = '/tmp/uv-proj';
	const output = fakeOutput();

	test('metadata', () => {
		const m = createUvManager();
		assert.strictEqual(m.id, 'uv');
		assert.strictEqual(m.syncCommandTitle, 'Sync dependencies');
		assert.strictEqual(m.afterAddShouldOfferManifestWrite, false);
		assert.strictEqual(m.manifestKind, 'pyproject.toml');
	});

	test('ensureEnv runs uv venv when missing', async () => {
		const calls: string[][] = [];
		const run: ProcessRunner = async (o) => {
			calls.push([o.command, ...o.args]);
			return { code: 0, stdout: '', stderr: '' };
		};
		const m = createUvManager();
		const result = await m.ensureEnv({
			root,
			output,
			run,
			pythonPath: '/usr/bin/python3',
			venvAlreadyExists: false,
		});
		assert.strictEqual(result, 'created');
		assert.ok(calls.some((c) => c[0] === 'uv' && c.includes('venv')));
		const venvCall = calls.find((c) => c[0] === 'uv' && c.includes('venv'));
		assert.ok(venvCall);
		assert.deepStrictEqual(venvCall, [
			'uv',
			'venv',
			'--python',
			'/usr/bin/python3',
		]);
	});

	test('ensureEnv skips when venv exists', async () => {
		let ran = false;
		const run: ProcessRunner = async () => {
			ran = true;
			return { code: 0, stdout: '', stderr: '' };
		};
		const m = createUvManager();
		const r = await m.ensureEnv({
			root,
			output,
			run,
			pythonPath: '/usr/bin/python3',
			venvAlreadyExists: true,
		});
		assert.strictEqual(r, 'exists');
		assert.strictEqual(ran, false);
	});

	test('syncManifest runs uv sync', async () => {
		let args: string[] | undefined;
		const run: ProcessRunner = async (o) => {
			args = o.args;
			return { code: 0, stdout: '', stderr: '' };
		};
		await createUvManager().syncManifest({ root, output, run });
		assert.deepStrictEqual(args, ['sync']);
	});

	test('addPackages runs uv add', async () => {
		let args: string[] | undefined;
		const run: ProcessRunner = async (o) => {
			args = o.args;
			return { code: 0, stdout: '', stderr: '' };
		};
		await createUvManager().addPackages({
			root,
			output,
			run,
			specs: ['requests', 'httpx'],
		});
		assert.deepStrictEqual(args, ['add', 'requests', 'httpx']);
	});

	test('removePackage runs uv remove', async () => {
		let args: string[] | undefined;
		const run: ProcessRunner = async (o) => {
			args = o.args;
			return { code: 0, stdout: '', stderr: '' };
		};
		await createUvManager().removePackage({ root, output, run, name: 'requests' });
		assert.deepStrictEqual(args, ['remove', 'requests']);
	});

	test('updatePackage runs lock --upgrade-package then sync', async () => {
		const calls: string[][] = [];
		const run: ProcessRunner = async (o) => {
			calls.push(o.args);
			return { code: 0, stdout: '', stderr: '' };
		};
		await createUvManager().updatePackage({ root, output, run, name: 'requests' });
		assert.deepStrictEqual(calls[0], ['lock', '--upgrade-package', 'requests']);
		assert.deepStrictEqual(calls[1], ['sync']);
	});

	test('listPackages parses uv pip list json and pins --python to .venv', async () => {
		let args: string[] | undefined;
		const run: ProcessRunner = async (o) => {
			args = o.args;
			return {
				code: 0,
				stdout: JSON.stringify([{ name: 'httpx', version: '0.27.0' }]),
				stderr: '',
			};
		};
		const pkgs = await createUvManager().listPackages({ root, output, run });
		assert.deepStrictEqual(pkgs, [{ name: 'httpx', version: '0.27.0' }]);
		assert.ok(args);
		assert.deepStrictEqual(args, [
			'pip',
			'list',
			'--python',
			venvPythonPath(root),
			'--format=json',
		]);
	});

	test('throws on non-zero exit', async () => {
		const run: ProcessRunner = async () => ({
			code: 1,
			stdout: '',
			stderr: 'boom',
		});
		await assert.rejects(
			() => createUvManager().syncManifest({ root, output, run }),
			/uv sync failed \(exit code 1\): boom/,
		);
	});

	test('runUv maps ENOENT to clear uv-not-found error', async () => {
		const run: ProcessRunner = async () => {
			const err = new Error('spawn uv ENOENT');
			(err as NodeJS.ErrnoException).code = 'ENOENT';
			throw err;
		};
		await assert.rejects(
			() => createUvManager().syncManifest({ root, output, run }),
			/uv not found on PATH\. Install uv or open a pip\/requirements project\./,
		);
	});
});
