import {
	freezeToRequirements,
	installPackage,
	installRequirements,
	listPackages,
	uninstallPackage,
	updatePackage,
} from '../pipService';
import { ensureVenv } from '../venvService';
import type { PackageManager } from './types';

export function createPipManager(): PackageManager {
	return {
		id: 'pip',
		syncCommandTitle: 'Install from requirements.txt',
		manifestKind: 'requirements.txt',
		afterAddShouldOfferManifestWrite: true,
		async ensureEnv(ctx) {
			return ensureVenv({
				root: ctx.root,
				pythonPath: ctx.pythonPath,
				output: ctx.output,
				venvAlreadyExists: ctx.venvAlreadyExists,
				run: ctx.run,
			});
		},
		async syncManifest(ctx) {
			await installRequirements({ root: ctx.root, output: ctx.output, run: ctx.run });
		},
		async addPackages(ctx) {
			await installPackage({ root: ctx.root, output: ctx.output, run: ctx.run, spec: ctx.specs });
		},
		async removePackage(ctx) {
			await uninstallPackage({ root: ctx.root, output: ctx.output, run: ctx.run, name: ctx.name });
		},
		async updatePackage(ctx) {
			await updatePackage({ root: ctx.root, output: ctx.output, run: ctx.run, name: ctx.name });
		},
		async listPackages(ctx) {
			return listPackages({ root: ctx.root, output: ctx.output, run: ctx.run });
		},
		async freezeToManifest(ctx) {
			return freezeToRequirements({ root: ctx.root, output: ctx.output, run: ctx.run });
		},
	};
}
