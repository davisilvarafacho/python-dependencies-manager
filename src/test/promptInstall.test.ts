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

/** Defaults for a fresh project that should prompt (pip-style). */
function baseOpts(
	overrides: Partial<Parameters<typeof maybePromptInstallFromRequirements>[0]> = {},
) {
	const prefs = overrides.preferences ?? new PromptPreferences(fakeContext());
	return {
		root: '/proj' as string | undefined,
		manifestPresent: true,
		venvExists: false,
		message: 'requirements.txt detected. Install dependencies into .venv?',
		primaryActionLabel: 'Install',
		onInstall: async () => {},
		...overrides,
		preferences: prefs,
	};
}

suite('maybePromptInstallFromRequirements', () => {
	test('skips when no root', async () => {
		let shown = false;
		let installed = false;

		await maybePromptInstallFromRequirements(
			baseOpts({
				root: undefined,
				onInstall: async () => {
					installed = true;
				},
				showInformationMessage: async () => {
					shown = true;
					return undefined;
				},
			}),
		);

		assert.strictEqual(shown, false);
		assert.strictEqual(installed, false);
	});

	test('skips when manifest is not present', async () => {
		let shown = false;

		await maybePromptInstallFromRequirements(
			baseOpts({
				manifestPresent: false,
				showInformationMessage: async () => {
					shown = true;
					return undefined;
				},
			}),
		);

		assert.strictEqual(shown, false);
	});

	test('skips when .venv already exists', async () => {
		let shown = false;

		await maybePromptInstallFromRequirements(
			baseOpts({
				venvExists: true,
				showInformationMessage: async () => {
					shown = true;
					return undefined;
				},
			}),
		);

		assert.strictEqual(shown, false);
	});

	test('skips when shouldAutoPrompt is false', async () => {
		let shown = false;
		const prefs = new PromptPreferences(fakeContext());
		prefs.setNotNowThisSession();

		await maybePromptInstallFromRequirements(
			baseOpts({
				preferences: prefs,
				showInformationMessage: async () => {
					shown = true;
					return undefined;
				},
			}),
		);

		assert.strictEqual(shown, false);
	});

	test('Install runs onInstall (pip message + label)', async () => {
		let installed = false;
		const messages: string[] = [];
		const buttons: string[][] = [];

		await maybePromptInstallFromRequirements(
			baseOpts({
				onInstall: async () => {
					installed = true;
				},
				showInformationMessage: (async (msg: string, ...items: string[]) => {
					messages.push(String(msg));
					buttons.push(items);
					return 'Install';
				}) as unknown as typeof vscode.window.showInformationMessage,
			}),
		);

		assert.strictEqual(installed, true);
		assert.ok(messages[0]?.includes('requirements.txt detected'));
		assert.deepStrictEqual(buttons[0], ['Install', 'Not now', "Don't ask again"]);
	});

	test('Sync runs onInstall (uv message + label)', async () => {
		let synced = false;
		const messages: string[] = [];
		const buttons: string[][] = [];

		await maybePromptInstallFromRequirements(
			baseOpts({
				message: 'pyproject.toml detected. Sync dependencies into .venv with uv?',
				primaryActionLabel: 'Sync',
				onInstall: async () => {
					synced = true;
				},
				showInformationMessage: (async (msg: string, ...items: string[]) => {
					messages.push(String(msg));
					buttons.push(items);
					return 'Sync';
				}) as unknown as typeof vscode.window.showInformationMessage,
			}),
		);

		assert.strictEqual(synced, true);
		assert.ok(messages[0]?.includes('pyproject.toml detected'));
		assert.deepStrictEqual(buttons[0], ['Sync', 'Not now', "Don't ask again"]);
	});

	test('Not now sets session flag', async () => {
		const prefs = new PromptPreferences(fakeContext());

		await maybePromptInstallFromRequirements(
			baseOpts({
				preferences: prefs,
				showInformationMessage: (async () =>
					'Not now') as typeof vscode.window.showInformationMessage,
			}),
		);

		assert.strictEqual(prefs.notNowThisSession, true);
		assert.strictEqual(prefs.shouldAutoPrompt(), false);
	});

	test("Don't ask again persists preference", async () => {
		const prefs = new PromptPreferences(fakeContext());

		await maybePromptInstallFromRequirements(
			baseOpts({
				preferences: prefs,
				showInformationMessage: (async () =>
					"Don't ask again") as typeof vscode.window.showInformationMessage,
			}),
		);

		assert.strictEqual(prefs.dontAskAgain, true);
		assert.strictEqual(prefs.shouldAutoPrompt(), false);
	});

	test('dismiss (undefined) does nothing', async () => {
		let installed = false;
		const prefs = new PromptPreferences(fakeContext());

		await maybePromptInstallFromRequirements(
			baseOpts({
				preferences: prefs,
				onInstall: async () => {
					installed = true;
				},
				showInformationMessage: (async () =>
					undefined) as typeof vscode.window.showInformationMessage,
			}),
		);

		assert.strictEqual(installed, false);
		assert.strictEqual(prefs.notNowThisSession, false);
		assert.strictEqual(prefs.dontAskAgain, false);
		assert.strictEqual(prefs.shouldAutoPrompt(), true);
	});
});
