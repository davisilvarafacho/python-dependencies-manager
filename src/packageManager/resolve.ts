import { pyprojectExists as defaultPyprojectExists } from '../paths';
import { isUvOnPath as defaultIsUvOnPath } from './detectUv';
import { createPipManager } from './pipManager';
import type { PackageManager } from './types';
import { createUvManager } from './uvManager';

export type ResolvePackageManagerOptions = {
	isUvOnPath?: () => boolean;
	pyprojectExists?: (root: string) => boolean;
};

export function shouldUseUv(
	root: string,
	options?: ResolvePackageManagerOptions,
): boolean {
	const isUv = options?.isUvOnPath ?? defaultIsUvOnPath;
	const hasPy = options?.pyprojectExists ?? defaultPyprojectExists;
	return isUv() && hasPy(root);
}

export function resolvePackageManager(
	root: string,
	options?: ResolvePackageManagerOptions & {
		createPip?: () => PackageManager;
		createUv?: () => PackageManager;
	},
): PackageManager {
	const createPip = options?.createPip ?? createPipManager;
	const createUv = options?.createUv ?? createUvManager;
	return shouldUseUv(root, options) ? createUv() : createPip();
}
