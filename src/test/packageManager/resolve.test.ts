import * as assert from 'assert';
import { shouldUseUv } from '../../packageManager/resolve';

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
