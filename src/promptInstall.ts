import * as vscode from 'vscode';
import type { PromptPreferences } from './preferences';

export type MaybePromptInstallOptions = {
	root: string | undefined;
	preferences: PromptPreferences;
	requirementsExists: boolean;
	/** When true, skip the auto-prompt — environment already set up. */
	venvExists: boolean;
	onInstall: () => Promise<void>;
	showInformationMessage?: typeof vscode.window.showInformationMessage;
};

export async function maybePromptInstallFromRequirements(
	options: MaybePromptInstallOptions,
): Promise<void> {
	const { root, preferences, requirementsExists, venvExists, onInstall } = options;

	// Only prompt on "fresh" projects: requirements present, but no .venv yet.
	if (!root || !requirementsExists || venvExists || !preferences.shouldAutoPrompt()) {
		return;
	}

	const showInformationMessage =
		options.showInformationMessage ??
		vscode.window.showInformationMessage.bind(vscode.window);

	const choice = await showInformationMessage(
		'requirements.txt detected. Install dependencies into .venv?',
		'Install',
		'Not now',
		"Don't ask again",
	);

	if (choice === 'Install') {
		await onInstall();
	} else if (choice === 'Not now') {
		preferences.setNotNowThisSession();
	} else if (choice === "Don't ask again") {
		await preferences.setDontAskAgain(true);
	}
}
