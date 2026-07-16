import * as vscode from 'vscode';

/** Single-folder MVP: first workspace folder only. */
export function getWorkspaceRootFsPath(): string | undefined {
	const folder = vscode.workspace.workspaceFolders?.[0];
	return folder?.uri.fsPath;
}
