import * as vscode from 'vscode';
import type { PromptPreferences } from './preferences';

export type MaybePromptInstallOptions = {
	root: string | undefined;
	preferences: PromptPreferences;
	/** True when the active backend's manifest exists */
	manifestPresent: boolean;
	/** When true, skip the auto-prompt — environment already set up. */
	venvExists: boolean;
	/** e.g. "requirements.txt detected..." vs "pyproject.toml detected..." */
	message: string;
	/** Primary button label: Install | Sync */
	primaryActionLabel: string;
	onInstall: () => Promise<void>;
	showInformationMessage?: typeof vscode.window.showInformationMessage;
};

export async function maybePromptInstallFromRequirements(
	options: MaybePromptInstallOptions,
): Promise<void> {
	const {
		root,
		preferences,
		manifestPresent,
		venvExists,
		message,
		primaryActionLabel,
		onInstall,
	} = options;

	// Only prompt on "fresh" projects: backend manifest present, but no .venv yet.
	if (!root || !manifestPresent || venvExists || !preferences.shouldAutoPrompt()) {
		return;
	}

	const showInformationMessage =
		options.showInformationMessage ??
		vscode.window.showInformationMessage.bind(vscode.window);

	const choice = await showInformationMessage(
		message,
		primaryActionLabel,
		'Not now',
		"Don't ask again",
	);

	if (choice === primaryActionLabel) {
		await onInstall();
	} else if (choice === 'Not now') {
		preferences.setNotNowThisSession();
	} else if (choice === "Don't ask again") {
		await preferences.setDontAskAgain(true);
	}
}
