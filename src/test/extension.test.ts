import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'rafacho.python-dependencies-manager';
const EXTENSION_NAME = 'python-dependencies-manager';

const CORE_COMMANDS = [
	'pythonDependenciesManager.installFromRequirements',
	'pythonDependenciesManager.syncDependencies',
	'pythonDependenciesManager.refreshPackages',
	'pythonDependenciesManager.installPackage',
	'pythonDependenciesManager.uninstallPackage',
	'pythonDependenciesManager.updatePackage',
] as const;

function findExtension(): vscode.Extension<unknown> | undefined {
	const byId = vscode.extensions.getExtension(EXTENSION_ID);
	if (byId) {
		return byId;
	}
	return vscode.extensions.all.find(
		(ext) =>
			ext.id === EXTENSION_ID ||
			ext.id.endsWith(`.${EXTENSION_NAME}`) ||
			ext.packageJSON?.name === EXTENSION_NAME,
	);
}

suite('Python Dependencies Manager', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('extension activates and registers core commands', async () => {
		const ext = findExtension();
		assert.ok(ext, `expected extension ${EXTENSION_ID} (or name ${EXTENSION_NAME})`);

		await ext.activate();
		assert.ok(ext.isActive, 'extension should be active after activate()');

		const commands = await vscode.commands.getCommands(true);
		for (const id of CORE_COMMANDS) {
			assert.ok(commands.includes(id), `expected command ${id}`);
		}
	});
});
