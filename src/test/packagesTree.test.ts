import * as assert from 'assert';
import * as vscode from 'vscode';
import { NoVenvError, PackageItem, PackagesTreeProvider } from '../packagesTree';
import type { PackageInfo } from '../pipService';

suite('packagesTree', () => {
	test('getChildren maps packages to PackageItem with contextValue package', async () => {
		const data: PackageInfo[] = [
			{ name: 'requests', version: '2.32.0' },
			{ name: 'pip', version: '24.0' },
		];
		const provider = new PackagesTreeProvider(async () => data);
		const children = await provider.getChildren();

		assert.strictEqual(children.length, 2);
		assert.ok(children[0] instanceof PackageItem);
		assert.ok(children[1] instanceof PackageItem);

		const a = children[0] as PackageItem;
		const b = children[1] as PackageItem;
		assert.strictEqual(a.label, 'requests');
		assert.strictEqual(a.description, '2.32.0');
		assert.strictEqual(a.contextValue, 'package');
		assert.deepStrictEqual(a.pkg, data[0]);
		assert.strictEqual(b.label, 'pip');
		assert.strictEqual(b.description, '24.0');
		assert.strictEqual(b.contextValue, 'package');
	});

	test('getChildren returns empty-list guidance when list is empty', async () => {
		const provider = new PackagesTreeProvider(async () => []);
		const children = await provider.getChildren();

		assert.strictEqual(children.length, 1);
		assert.ok(!(children[0] instanceof PackageItem));
		assert.notStrictEqual(children[0].contextValue, 'package');
		assert.strictEqual(
			children[0].label,
			'No packages in .venv — install dependencies to get started',
		);
	});

	test('getChildren returns no-venv guidance when NoVenvError is thrown', async () => {
		const provider = new PackagesTreeProvider(async () => {
			throw new NoVenvError();
		});
		const children = await provider.getChildren();

		assert.strictEqual(children.length, 1);
		assert.ok(!(children[0] instanceof PackageItem));
		assert.notStrictEqual(children[0].contextValue, 'package');
		assert.strictEqual(
			children[0].label,
			'No .venv found — run Install from requirements.txt',
		);
	});

	test('getChildren returns generic guidance when list fails with other error', async () => {
		const provider = new PackagesTreeProvider(async () => {
			throw new Error('pip failed');
		});
		const children = await provider.getChildren();

		assert.strictEqual(children.length, 1);
		assert.ok(!(children[0] instanceof PackageItem));
		assert.notStrictEqual(children[0].contextValue, 'package');
		assert.ok(
			typeof children[0].label === 'string' &&
				(children[0].label as string).includes('Unable to list packages'),
		);
	});

	test('refresh fires onDidChangeTreeData', async () => {
		const provider = new PackagesTreeProvider(async () => []);
		let fired = false;
		const sub = provider.onDidChangeTreeData(() => {
			fired = true;
		});
		provider.refresh();
		sub.dispose();
		assert.strictEqual(fired, true);
	});

	test('getTreeItem returns the same element', () => {
		const item = new PackageItem({ name: 'x', version: '1' });
		const provider = new PackagesTreeProvider(async () => []);
		assert.strictEqual(provider.getTreeItem(item), item);
	});
});
