import * as vscode from 'vscode';

export class InterpreterError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InterpreterError';
	}
}

export type PythonExtensionApi = {
	environments?: {
		getActiveEnvironmentPath?: (resource?: unknown) => { path: string } | string | undefined;
	};
	settings?: {
		getExecutionDetails?: (resource?: unknown) => { execCommand?: string[] | undefined };
	};
};

export async function resolvePythonPathFromApi(api: PythonExtensionApi): Promise<string> {
	const active = api.environments?.getActiveEnvironmentPath?.();
	if (typeof active === 'string' && active.trim()) {
		return active.trim();
	}
	if (active && typeof active === 'object' && 'path' in active && active.path) {
		return String(active.path);
	}

	const exec = api.settings?.getExecutionDetails?.()?.execCommand?.[0];
	if (exec && exec.trim()) {
		return exec.trim();
	}

	throw new InterpreterError(
		'Select a Python interpreter (Python: Select Interpreter) before managing dependencies.',
	);
}

export async function getSelectedPythonPath(): Promise<string> {
	const ext = vscode.extensions.getExtension<PythonExtensionApi>('ms-python.python');
	if (!ext) {
		throw new InterpreterError(
			'The Python extension (ms-python.python) is required. Install it and select an interpreter.',
		);
	}
	if (!ext.isActive) {
		await ext.activate();
	}
	return resolvePythonPathFromApi(ext.exports ?? {});
}
