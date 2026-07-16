import type { PackageInfo } from './pipService';

/** Case-insensitive filter by package name or version. */
export function filterPackages(packages: PackageInfo[], query: string): PackageInfo[] {
	const q = query.trim().toLowerCase();
	if (!q) {
		return packages;
	}
	return packages.filter(
		(pkg) =>
			pkg.name.toLowerCase().includes(q) || pkg.version.toLowerCase().includes(q),
	);
}
