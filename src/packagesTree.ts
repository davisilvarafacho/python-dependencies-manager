import * as vscode from 'vscode';
import type { PackageInfo } from './pipService';

export class PackageItem extends vscode.TreeItem {
	constructor(public readonly pkg: PackageInfo) {
		super(pkg.name, vscode.TreeItemCollapsibleState.None);
		this.description = pkg.version;
		this.contextValue = 'package';
		this.tooltip = `${pkg.name} ${pkg.version}`;
	}
}

export class PackagesTreeProvider
	implements vscode.TreeDataProvider<PackageItem | vscode.TreeItem>
{
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<
		PackageItem | vscode.TreeItem | undefined | null | void
	>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private readonly list: () => Promise<PackageInfo[]>) {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: PackageItem | vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(
		element?: PackageItem | vscode.TreeItem,
	): Promise<(PackageItem | vscode.TreeItem)[]> {
		if (element) {
			return [];
		}

		try {
			const packages = await this.list();
			if (packages.length === 0) {
				return [this.guidanceItem('No packages in .venv — install dependencies to get started')];
			}
			return packages.map((pkg) => new PackageItem(pkg));
		} catch {
			return [
				this.guidanceItem(
					'Unable to list packages — ensure .venv exists or install from requirements.txt',
				),
			];
		}
	}

	private guidanceItem(label: string): vscode.TreeItem {
		const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
		// Intentionally not 'package' so context menus (uninstall/update) stay hidden
		item.contextValue = 'guidance';
		return item;
	}
}
