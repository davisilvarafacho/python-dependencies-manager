import * as vscode from 'vscode';

/**
 * Entry point. MVP behavior is defined in:
 * docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md
 *
 * Commands are registered as stubs until the implementation plan is executed.
 */
export function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('Python Dependencies Manager');
	context.subscriptions.push(output);

	const stub = (label: string) => () => {
		const message = `${label} — ainda não implementado (ver design spec).`;
		output.appendLine(message);
		void vscode.window.showInformationMessage(message);
	};

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'pythonDependenciesManager.installFromRequirements',
			stub('Install from requirements.txt'),
		),
		vscode.commands.registerCommand(
			'pythonDependenciesManager.refreshPackages',
			stub('Refresh Packages'),
		),
		vscode.commands.registerCommand(
			'pythonDependenciesManager.installPackage',
			stub('Install Package'),
		),
		vscode.commands.registerCommand(
			'pythonDependenciesManager.uninstallPackage',
			stub('Uninstall Package'),
		),
		vscode.commands.registerCommand(
			'pythonDependenciesManager.updatePackage',
			stub('Update Package'),
		),
	);

	const packagesView = vscode.window.createTreeView('pythonDependenciesManager.packages', {
		treeDataProvider: new PlaceholderPackagesProvider(),
		showCollapseAll: false,
	});
	context.subscriptions.push(packagesView);

	output.appendLine('Python Dependencies Manager activated.');
}

export function deactivate() {}

class PlaceholderPackagesProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
		const item = new vscode.TreeItem(
			'Implementation pending — see design spec',
			vscode.TreeItemCollapsibleState.None,
		);
		item.description = 'MVP not wired yet';
		item.tooltip = 'Package list will appear here after pip integration.';
		return [item];
	}
}
