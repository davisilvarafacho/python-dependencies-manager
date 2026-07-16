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
		resolveEnvironment?: (
			path: unknown,
		) => Promise<
			| {
					executable?: { uri?: { fsPath?: string }; path?: string };
					path?: string;
			  }
			| undefined
		>;
	};
	settings?: {
		getExecutionDetails?: (resource?: unknown) => { execCommand?: string[] | undefined };
	};
};

export async function resolvePythonPathFromApi(api: PythonExtensionApi): Promise<string> {
	const active = api.environments?.getActiveEnvironmentPath?.();

	// Prefer resolveEnvironment so we get an executable path, not just an env id.
	if (active !== undefined && api.environments?.resolveEnvironment) {
		try {
			const resolved = await api.environments.resolveEnvironment(active);
			const fromUri = resolved?.executable?.uri?.fsPath;
			if (fromUri?.trim()) {
				return fromUri.trim();
			}
			const fromExecPath = resolved?.executable?.path;
			if (fromExecPath?.trim()) {
				return fromExecPath.trim();
			}
			if (resolved?.path?.trim()) {
				return resolved.path.trim();
			}
		} catch {
			// Fall through to raw path / settings.
		}
	}

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
