import * as assert from 'assert';
import * as path from 'path';
import { requirementsTxtPath, venvDirPath, venvPythonPath } from '../paths';

suite('paths', () => {
	const root = path.join('/tmp', 'proj');

	test('requirementsTxtPath joins root', () => {
		assert.strictEqual(
			requirementsTxtPath(root),
			path.join(root, 'requirements.txt'),
		);
	});

	test('venvDirPath joins root', () => {
		assert.strictEqual(venvDirPath(root), path.join(root, '.venv'));
	});

	test('venvPythonPath is platform-specific', () => {
		const py = venvPythonPath(root);
		if (process.platform === 'win32') {
			assert.strictEqual(py, path.join(root, '.venv', 'Scripts', 'python.exe'));
		} else {
			assert.strictEqual(py, path.join(root, '.venv', 'bin', 'python'));
		}
	});
});
