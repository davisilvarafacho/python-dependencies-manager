import * as assert from 'assert';
import { resolvePythonPathFromApi, InterpreterError } from '../pythonInterpreter';

suite('resolvePythonPathFromApi', () => {
	test('uses environments.getActiveEnvironmentPath object path', async () => {
		const path = await resolvePythonPathFromApi({
			environments: {
				getActiveEnvironmentPath: () => ({ path: '/usr/bin/python3' }),
			},
		});
		assert.strictEqual(path, '/usr/bin/python3');
	});

	test('uses environments.getActiveEnvironmentPath string', async () => {
		const path = await resolvePythonPathFromApi({
			environments: {
				getActiveEnvironmentPath: () => '/opt/python/bin/python',
			},
		});
		assert.strictEqual(path, '/opt/python/bin/python');
	});

	test('falls back to settings.getExecutionDetails execCommand', async () => {
		const path = await resolvePythonPathFromApi({
			settings: {
				getExecutionDetails: () => ({ execCommand: ['/home/user/.venv/bin/python'] }),
			},
		});
		assert.strictEqual(path, '/home/user/.venv/bin/python');
	});

	test('throws when missing', async () => {
		await assert.rejects(
			() => resolvePythonPathFromApi({}),
			(e: unknown) => e instanceof InterpreterError,
		);
	});

	test('throws InterpreterError with select-interpreter message when missing', async () => {
		await assert.rejects(
			() => resolvePythonPathFromApi({}),
			(e: unknown) => {
				if (!(e instanceof InterpreterError)) {
					return false;
				}
				return e.message.includes('Select a Python interpreter');
			},
		);
	});
});
