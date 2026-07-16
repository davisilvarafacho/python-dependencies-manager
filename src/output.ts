import * as vscode from 'vscode';

export const OUTPUT_CHANNEL_NAME = 'Python Dependencies Manager';

export function createOutputChannel(): vscode.OutputChannel {
	return vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
}
