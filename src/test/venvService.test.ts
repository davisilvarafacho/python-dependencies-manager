import * as assert from 'assert';
import type * as vscode from 'vscode';
import { ensureVenv } from '../venvService';

suite('ensureVenv', () => {
	const output = { appendLine() {}, append() {} } as unknown as vscode.OutputChannel;

	test('skips creation when venv exists', async () => {
		let called = 0;
		const result = await ensureVenv({
			root: '/proj',
			pythonPath: '/usr/bin/python3',
			output,
			venvAlreadyExists: true,
			run: async () => {
				called += 1;
				return { code: 0, stdout: '', stderr: '' };
			},
		});
		assert.strictEqual(result, 'exists');
		assert.strictEqual(called, 0);
	});

	test('creates venv when missing', async () => {
		let args: string[] = [];
		const result = await ensureVenv({
			root: '/proj',
			pythonPath: '/usr/bin/python3',
			output,
			venvAlreadyExists: false,
			run: async (opts) => {
				args = opts.args;
				return { code: 0, stdout: '', stderr: '' };
			},
		});
		assert.strictEqual(result, 'created');
		assert.deepStrictEqual(args.slice(0, 2), ['-m', 'venv']);
	});

	test('throws when venv creation fails', async () => {
		await assert.rejects(
			async () =>
				ensureVenv({
					root: '/proj',
					pythonPath: '/usr/bin/python3',
					output,
					venvAlreadyExists: false,
					run: async () => ({
						code: 1,
						stdout: '',
						stderr: 'Permission denied creating venv',
					}),
				}),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes('Permission denied'));
				return true;
			},
		);
	});
});
