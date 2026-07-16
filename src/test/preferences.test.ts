import * as assert from 'assert';
import { PromptPreferences } from '../preferences';

suite('PromptPreferences', () => {
	test('shouldAutoPrompt is false after notNow', () => {
		const state = new Map<string, unknown>();
		const fakeContext = {
			workspaceState: {
				get: <T>(key: string, defaultValue?: T) =>
					(state.has(key) ? state.get(key) : defaultValue) as T,
				update: async (key: string, value: unknown) => {
					state.set(key, value);
				},
			},
		} as unknown as import('vscode').ExtensionContext;

		const prefs = new PromptPreferences(fakeContext);
		assert.strictEqual(prefs.shouldAutoPrompt(), true);
		prefs.setNotNowThisSession();
		assert.strictEqual(prefs.shouldAutoPrompt(), false);
	});

	test('shouldAutoPrompt is false after dontAskAgain', async () => {
		const state = new Map<string, unknown>();
		const fakeContext = {
			workspaceState: {
				get: <T>(key: string, defaultValue?: T) =>
					(state.has(key) ? state.get(key) : defaultValue) as T,
				update: async (key: string, value: unknown) => {
					state.set(key, value);
				},
			},
		} as unknown as import('vscode').ExtensionContext;

		const prefs = new PromptPreferences(fakeContext);
		await prefs.setDontAskAgain(true);
		assert.strictEqual(prefs.shouldAutoPrompt(), false);
	});
});
