import type * as vscode from 'vscode';

/** Structured log line for the Output Channel (timestamp + scope). */
export function log(
	output: vscode.OutputChannel,
	scope: string,
	message: string,
): void {
	const ts = new Date().toISOString();
	output.appendLine(`[${ts}] [${scope}] ${message}`);
}

export function logSection(output: vscode.OutputChannel, title: string): void {
	output.appendLine('');
	output.appendLine(`========== ${title} ==========`);
}
