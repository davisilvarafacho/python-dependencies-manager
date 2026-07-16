import * as assert from 'assert';
import * as vscode from 'vscode';
import { runProcess } from '../runProcess';

suite('runProcess', () => {
	test('captures stdout and zero exit code', async () => {
		const lines: string[] = [];
		const output = {
			appendLine: (s: string) => lines.push(s),
			append: (s: string) => lines.push(s),
		} as unknown as vscode.OutputChannel;

		const isWin = process.platform === 'win32';
		const result = await runProcess({
			command: isWin ? 'cmd' : 'echo',
			args: isWin ? ['/c', 'echo hello-pdm'] : ['hello-pdm'],
			cwd: process.cwd(),
			output,
		});

		assert.strictEqual(result.code, 0);
		assert.ok(
			result.stdout.includes('hello-pdm') || lines.join('').includes('hello-pdm'),
			'expected hello-pdm in output',
		);
	});
});
