import * as vscode from 'vscode';
import {
	DEFAULT_SEARCH_LIMIT,
	searchPypiPackages,
	type PypiPackageHit,
} from './pypiClient';

export type PackagePickResult = {
	/** Value to pass to pip install (name or name==version if pinned later). */
	spec: string;
	name: string;
	version?: string;
};

/**
 * QuickPick with debounced PyPI search.
 * Latest version is shown on the right via `description`.
 */
export async function pickPackageToInstall(options?: {
	debounceMs?: number;
	search?: (query: string, limit?: number) => Promise<PypiPackageHit[]>;
}): Promise<PackagePickResult | undefined> {
	const debounceMs = options?.debounceMs ?? 280;
	const search = options?.search ?? searchPypiPackages;

	type PickItem = vscode.QuickPickItem & { hit?: PypiPackageHit; freeform?: boolean };

	const quickPick = vscode.window.createQuickPick<PickItem>();
	quickPick.title = 'Install Python package';
	quickPick.placeholder = 'Search packages on PyPI…';
	quickPick.matchOnDescription = true;
	quickPick.matchOnDetail = true;
	quickPick.ignoreFocusOut = true;
	quickPick.items = [];
	quickPick.busy = false;

	let seq = 0;
	let timer: NodeJS.Timeout | undefined;

	const runSearch = (value: string) => {
		const mySeq = ++seq;
		const q = value.trim();
		if (!q) {
			quickPick.items = [];
			quickPick.busy = false;
			return;
		}
		quickPick.busy = true;
		void (async () => {
			try {
				const hits = await search(q, DEFAULT_SEARCH_LIMIT);
				if (mySeq !== seq) {
					return;
				}
				const items: PickItem[] = hits.map((hit) => ({
					label: hit.name,
					// description appears on the right in QuickPick
					description: hit.version,
					detail: hit.summary || undefined,
					hit,
				}));
				// Allow free-form install of whatever was typed
				if (!items.some((i) => i.label.toLowerCase() === q.toLowerCase())) {
					items.unshift({
						label: q,
						description: 'install as typed',
						detail: 'Use exact text (name, name==version, git+…, etc.)',
						freeform: true,
					});
				}
				quickPick.items = items;
			} catch {
				if (mySeq !== seq) {
					return;
				}
				quickPick.items = [
					{
						label: q,
						description: 'install as typed',
						detail: 'PyPI search failed — install using the typed name',
						freeform: true,
					},
				];
			} finally {
				if (mySeq === seq) {
					quickPick.busy = false;
				}
			}
		})();
	};

	quickPick.onDidChangeValue((value) => {
		if (timer) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => runSearch(value), debounceMs);
	});

	const result = await new Promise<PackagePickResult | undefined>((resolve) => {
		let settled = false;
		const finish = (value: PackagePickResult | undefined) => {
			if (settled) {
				return;
			}
			settled = true;
			resolve(value);
			quickPick.hide();
		};

		quickPick.onDidAccept(() => {
			const selected = quickPick.selectedItems[0];
			if (!selected) {
				finish(undefined);
				return;
			}
			if (selected.hit) {
				finish({
					spec: selected.hit.name,
					name: selected.hit.name,
					version: selected.hit.version,
				});
				return;
			}
			const typed = (selected.label || quickPick.value).trim();
			finish(typed ? { spec: typed, name: typed } : undefined);
		});
		quickPick.onDidHide(() => {
			finish(undefined);
			quickPick.dispose();
		});
		quickPick.show();
		if (quickPick.value.trim()) {
			runSearch(quickPick.value);
		}
	});

	if (timer) {
		clearTimeout(timer);
	}
	return result;
}
