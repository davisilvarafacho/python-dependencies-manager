import * as assert from 'assert';
import type * as vscode from 'vscode';
import { runInstallFromRequirements } from '../installFlow';
import { InterpreterError } from '../pythonInterpreter';

suite('runInstallFromRequirements', () => {
	test('calls python → venv → pip in order', async () => {
		const steps: string[] = [];
		const output = {
			appendLine() {},
			append() {},
			show() {},
		} as unknown as vscode.OutputChannel;

		await runInstallFromRequirements({
			root: '/proj',
			output,
			getPythonPath: async () => {
				steps.push('python');
				return '/usr/bin/python3';
			},
			ensureVenv: async () => {
				steps.push('venv');
				return 'created';
			},
			installRequirements: async () => {
				steps.push('pip');
			},
			withProgress: async (_opts, task) =>
				task(
					{ report: () => {} } as vscode.Progress<{ message?: string; increment?: number }>,
					{} as vscode.CancellationToken,
				),
			showInformationMessage: async () => undefined,
			showErrorMessage: async () => undefined,
		});

		assert.deepStrictEqual(steps, ['python', 'venv', 'pip']);
	});

	test('shows success message after install', async () => {
		const messages: string[] = [];
		const output = {
			appendLine() {},
			append() {},
			show() {},
		} as unknown as vscode.OutputChannel;

		await runInstallFromRequirements({
			root: '/proj',
			output,
			getPythonPath: async () => '/usr/bin/python3',
			ensureVenv: async () => 'exists',
			installRequirements: async () => {},
			withProgress: async (_opts, task) =>
				task(
					{ report: () => {} } as vscode.Progress<{ message?: string; increment?: number }>,
					{} as vscode.CancellationToken,
				),
			showInformationMessage: async (msg: string) => {
				messages.push(String(msg));
				return undefined;
			},
			showErrorMessage: async () => undefined,
		});

		assert.deepStrictEqual(messages, ['Dependencies installed successfully.']);
	});

	test('InterpreterError shows message without opening output', async () => {
		let shown = false;
		const errors: string[] = [];
		const output = {
			appendLine() {},
			append() {},
			show() {
				shown = true;
			},
		} as unknown as vscode.OutputChannel;

		await runInstallFromRequirements({
			root: '/proj',
			output,
			getPythonPath: async () => {
				throw new InterpreterError('Select a Python interpreter');
			},
			ensureVenv: async () => 'exists',
			installRequirements: async () => {},
			withProgress: async (_opts, task) =>
				task(
					{ report: () => {} } as vscode.Progress<{ message?: string; increment?: number }>,
					{} as vscode.CancellationToken,
				),
			showInformationMessage: async () => undefined,
			showErrorMessage: async (msg: string) => {
				errors.push(String(msg));
				return undefined;
			},
		});

		assert.deepStrictEqual(errors, ['Select a Python interpreter']);
		assert.strictEqual(shown, false);
	});

	test('other errors show message and open output channel', async () => {
		let shownPreserveFocus: boolean | undefined;
		const errors: string[] = [];
		const output = {
			appendLine() {},
			append() {},
			show(preserveFocus?: boolean) {
				shownPreserveFocus = preserveFocus;
			},
		} as unknown as vscode.OutputChannel;

		await runInstallFromRequirements({
			root: '/proj',
			output,
			getPythonPath: async () => '/usr/bin/python3',
			ensureVenv: async () => 'exists',
			installRequirements: async () => {
				throw new Error('pip install requirements failed');
			},
			withProgress: async (_opts, task) =>
				task(
					{ report: () => {} } as vscode.Progress<{ message?: string; increment?: number }>,
					{} as vscode.CancellationToken,
				),
			showInformationMessage: async () => undefined,
			showErrorMessage: async (msg: string) => {
				errors.push(String(msg));
				return undefined;
			},
		});

		assert.deepStrictEqual(errors, ['pip install requirements failed']);
		assert.strictEqual(shownPreserveFocus, true);
	});
});
