import * as assert from 'assert';
import type * as vscode from 'vscode';
import { PromptPreferences } from '../preferences';
import { maybePromptInstallFromRequirements } from '../promptInstall';

function fakeContext(initial: Record<string, unknown> = {}): vscode.ExtensionContext {
	const state = new Map<string, unknown>(Object.entries(initial));
	return {
		workspaceState: {
			get: <T>(key: string, defaultValue?: T) =>
				(state.has(key) ? state.get(key) : defaultValue) as T,
			update: async (key: string, value: unknown) => {
				state.set(key, value);
			},
		},
	} as unknown as vscode.ExtensionContext;
}

suite('maybePromptInstallFromRequirements', () => {
	test('skips when no root', async () => {
		let shown = false;
		let installed = false;
		const prefs = new PromptPreferences(fakeContext());

		await maybePromptInstallFromRequirements({
			root: undefined,
			preferences: prefs,
			requirementsExists: true,
			onInstall: async () => {
				installed = true;
			},
			showInformationMessage: async () => {
				shown = true;
				return undefined;
			},
		});

		assert.strictEqual(shown, false);
		assert.strictEqual(installed, false);
	});

	test('skips when no requirements.txt', async () => {
		let shown = false;
		const prefs = new PromptPreferences(fakeContext());

		await maybePromptInstallFromRequirements({
			root: '/proj',
			preferences: prefs,
			requirementsExists: false,
			onInstall: async () => {},
			showInformationMessage: async () => {
				shown = true;
				return undefined;
			},
		});

		assert.strictEqual(shown, false);
	});

	test('skips when shouldAutoPrompt is false', async () => {
		let shown = false;
		const prefs = new PromptPreferences(fakeContext());
		prefs.setNotNowThisSession();

		await maybePromptInstallFromRequirements({
			root: '/proj',
			preferences: prefs,
			requirementsExists: true,
			onInstall: async () => {},
			showInformationMessage: async () => {
				shown = true;
				return undefined;
			},
		});

		assert.strictEqual(shown, false);
	});

	test('Install runs onInstall', async () => {
		let installed = false;
		const prefs = new PromptPreferences(fakeContext());
		const messages: string[] = [];

		await maybePromptInstallFromRequirements({
			root: '/proj',
			preferences: prefs,
			requirementsExists: true,
			onInstall: async () => {
				installed = true;
			},
			showInformationMessage: (async (msg: string) => {
				messages.push(String(msg));
				return 'Install';
			}) as typeof vscode.window.showInformationMessage,
		});

		assert.strictEqual(installed, true);
		assert.ok(messages[0]?.includes('requirements.txt detected'));
	});

	test('Not now sets session flag', async () => {
		const prefs = new PromptPreferences(fakeContext());

		await maybePromptInstallFromRequirements({
			root: '/proj',
			preferences: prefs,
			requirementsExists: true,
			onInstall: async () => {},
			showInformationMessage: (async () => 'Not now') as typeof vscode.window.showInformationMessage,
		});

		assert.strictEqual(prefs.notNowThisSession, true);
		assert.strictEqual(prefs.shouldAutoPrompt(), false);
	});

	test("Don't ask again persists preference", async () => {
		const prefs = new PromptPreferences(fakeContext());

		await maybePromptInstallFromRequirements({
			root: '/proj',
			preferences: prefs,
			requirementsExists: true,
			onInstall: async () => {},
			showInformationMessage: (async () =>
				"Don't ask again") as typeof vscode.window.showInformationMessage,
		});

		assert.strictEqual(prefs.dontAskAgain, true);
		assert.strictEqual(prefs.shouldAutoPrompt(), false);
	});

	test('dismiss (undefined) does nothing', async () => {
		let installed = false;
		const prefs = new PromptPreferences(fakeContext());

		await maybePromptInstallFromRequirements({
			root: '/proj',
			preferences: prefs,
			requirementsExists: true,
			onInstall: async () => {
				installed = true;
			},
			showInformationMessage: (async () =>
				undefined) as typeof vscode.window.showInformationMessage,
		});

		assert.strictEqual(installed, false);
		assert.strictEqual(prefs.notNowThisSession, false);
		assert.strictEqual(prefs.dontAskAgain, false);
		assert.strictEqual(prefs.shouldAutoPrompt(), true);
	});
});
