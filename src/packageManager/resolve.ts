import { pyprojectExists as defaultPyprojectExists } from '../paths';
import { isUvOnPath as defaultIsUvOnPath } from './detectUv';

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
