import * as vscode from 'vscode';

export const DONT_ASK_AGAIN_KEY = 'pythonDependenciesManager.dontAskAgain';

export class PromptPreferences {
	private notNow = false;

	constructor(private readonly context: vscode.ExtensionContext) {}

	get dontAskAgain(): boolean {
		return this.context.workspaceState.get<boolean>(DONT_ASK_AGAIN_KEY, false);
	}

	setDontAskAgain(value: boolean): Thenable<void> {
		return this.context.workspaceState.update(DONT_ASK_AGAIN_KEY, value);
	}

	get notNowThisSession(): boolean {
		return this.notNow;
	}

	setNotNowThisSession(): void {
		this.notNow = true;
	}

	shouldAutoPrompt(): boolean {
		return !this.dontAskAgain && !this.notNowThisSession;
	}
}
