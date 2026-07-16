import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Python Dependencies Manager', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('extension activates and registers core commands', async () => {
		const ext = vscode.extensions.getExtension('rafacho.python-dependencies-manager');
		// In development host the id may differ until publisher is published;
		// fall back to scanning contributed commands.
		const commands = await vscode.commands.getCommands(true);
		assert.ok(
			commands.includes('pythonDependenciesManager.installFromRequirements'),
			'expected installFromRequirements command',
		);
		assert.ok(
			commands.includes('pythonDependenciesManager.refreshPackages'),
			'expected refreshPackages command',
		);
		assert.ok(
			commands.includes('pythonDependenciesManager.installPackage'),
			'expected installPackage command',
		);
		if (ext) {
			await ext.activate();
			assert.ok(ext.isActive);
		}
	});
});
