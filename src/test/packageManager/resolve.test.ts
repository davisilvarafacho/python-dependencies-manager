import * as assert from 'assert';
import { resolvePackageManager, shouldUseUv } from '../../packageManager/resolve';
import type { PackageManager } from '../../packageManager/types';

suite('shouldUseUv', () => {
	test('true when uv on path and pyproject exists', () => {
		assert.strictEqual(
			shouldUseUv('/proj', {
				isUvOnPath: () => true,
				pyprojectExists: () => true,
			}),
			true,
		);
	});

	test('false when uv missing', () => {
		assert.strictEqual(
			shouldUseUv('/proj', {
				isUvOnPath: () => false,
				pyprojectExists: () => true,
			}),
			false,
		);
	});

	test('false when pyproject missing', () => {
		assert.strictEqual(
			shouldUseUv('/proj', {
				isUvOnPath: () => true,
				pyprojectExists: () => false,
			}),
			false,
		);
	});
});

suite('resolvePackageManager', () => {
	test('resolvePackageManager returns uv id when shouldUseUv', () => {
		const m = resolvePackageManager('/proj', {
			isUvOnPath: () => true,
			pyprojectExists: () => true,
			createUv: () => ({ id: 'uv' } as PackageManager),
			createPip: () => ({ id: 'pip' } as PackageManager),
		});
		assert.strictEqual(m.id, 'uv');
	});

	test('resolvePackageManager returns pip otherwise', () => {
		const m = resolvePackageManager('/proj', {
			isUvOnPath: () => false,
			pyprojectExists: () => true,
			createUv: () => ({ id: 'uv' } as PackageManager),
			createPip: () => ({ id: 'pip' } as PackageManager),
		});
		assert.strictEqual(m.id, 'pip');
	});
});
