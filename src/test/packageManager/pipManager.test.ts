import * as assert from 'assert';
import { createPipManager } from '../../packageManager/pipManager';

suite('pipManager', () => {
	test('metadata matches pip product copy', () => {
		const m = createPipManager();
		assert.strictEqual(m.id, 'pip');
		assert.strictEqual(m.syncCommandTitle, 'Install from requirements.txt');
		assert.strictEqual(m.afterAddShouldOfferManifestWrite, true);
		assert.strictEqual(m.manifestKind, 'requirements.txt');
	});
});
