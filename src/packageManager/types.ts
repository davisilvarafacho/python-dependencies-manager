import type * as vscode from 'vscode';
import type { ProcessRunner } from '../runProcess';

export type PackageInfo = { name: string; version: string };
export type PackageManagerId = 'pip' | 'uv';

export type ManagerContext = {
	root: string;
	output: vscode.OutputChannel;
	run?: ProcessRunner;
};

export type PackageManager = {
	readonly id: PackageManagerId;
	readonly syncCommandTitle: string;
	readonly manifestKind: 'requirements.txt' | 'pyproject.toml';
	readonly afterAddShouldOfferManifestWrite: boolean;

	ensureEnv(
		ctx: ManagerContext & { pythonPath: string; venvAlreadyExists: boolean },
	): Promise<'created' | 'exists'>;
	syncManifest(ctx: ManagerContext): Promise<void>;
	addPackages(ctx: ManagerContext & { specs: string[] }): Promise<void>;
	removePackage(ctx: ManagerContext & { name: string }): Promise<void>;
	updatePackage(ctx: ManagerContext & { name: string }): Promise<void>;
	listPackages(ctx: ManagerContext): Promise<PackageInfo[]>;
	/** Pip-only meaningful; uv may throw or no-op if called — prefer gate via afterAddShouldOfferManifestWrite */
	freezeToManifest?(ctx: ManagerContext): Promise<string>;
};
