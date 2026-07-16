import * as vscode from 'vscode';
import {
	DEFAULT_SEARCH_LIMIT,
	searchPypiPackages,
	type PypiPackageHit,
} from './pypiClient';

export type PackagePickResult = {
	/** Value to pass to pip install (name or free-form spec). */
	spec: string;
	name: string;
	version?: string;
};

/**
 * Multi-select QuickPick with debounced PyPI search.
 * Latest version is shown on the right via `description`.
 * Select several packages with checkboxes, then Enter / OK to install all.
 */
export async function pickPackagesToInstall(options?: {
	debounceMs?: number;
	search?: (query: string, limit?: number) => Promise<PypiPackageHit[]>;
}): Promise<PackagePickResult[] | undefined> {
	const debounceMs = options?.debounceMs ?? 280;
	const search = options?.search ?? searchPypiPackages;

	type PickItem = vscode.QuickPickItem & { hit?: PypiPackageHit; freeform?: boolean };

	const quickPick = vscode.window.createQuickPick<PickItem>();
	quickPick.title = 'Install Python packages';
	quickPick.placeholder = 'Search PyPI… (select one or more, then Enter)';
	quickPick.canSelectMany = true;
	quickPick.matchOnDescription = true;
	quickPick.matchOnDetail = true;
	quickPick.ignoreFocusOut = true;
	quickPick.items = [];
	quickPick.busy = false;
	quickPick.buttons = [
		{
			iconPath: new vscode.ThemeIcon('check'),
			tooltip: 'Install selected packages',
		},
	];

	/** Keep selected package names across search refreshes. */
	const selectedByKey = new Map<string, PackagePickResult>();

	let seq = 0;
	let timer: NodeJS.Timeout | undefined;

	const keyOf = (item: PickItem): string => {
		if (item.hit) {
			return item.hit.name.toLowerCase();
		}
		return (item.label || '').toLowerCase();
	};

	const rememberSelection = () => {
		for (const item of quickPick.selectedItems) {
			if (item.hit) {
				selectedByKey.set(item.hit.name.toLowerCase(), {
					spec: item.hit.name,
					name: item.hit.name,
					version: item.hit.version,
				});
			} else if (item.freeform || item.label) {
				const typed = item.label.trim();
				if (typed) {
					selectedByKey.set(typed.toLowerCase(), { spec: typed, name: typed });
				}
			}
		}
	};

	const applySelectionToItems = (items: PickItem[]): PickItem[] => {
		// Re-select items that were previously chosen (same package name).
		const selected: PickItem[] = [];
		for (const item of items) {
			if (selectedByKey.has(keyOf(item))) {
				selected.push(item);
			}
		}
		// Also keep selected packages not in current result list as sticky rows at top.
		const present = new Set(items.map((i) => keyOf(i)));
		const sticky: PickItem[] = [];
		for (const [key, pick] of selectedByKey) {
			if (!present.has(key)) {
				sticky.push({
					label: pick.name,
					description: pick.version ?? 'selected',
					detail: 'Selected — kept while you search',
					hit: pick.version
						? { name: pick.name, version: pick.version, summary: '' }
						: undefined,
					freeform: !pick.version,
				});
			}
		}
		const merged = [...sticky, ...items];
		// selectedItems will be set after assigning items
		return merged;
	};

	const runSearch = (value: string) => {
		const mySeq = ++seq;
		const q = value.trim();
		if (!q) {
			// Still show sticky selected packages when the query is cleared.
			const stickyOnly = applySelectionToItems([]);
			quickPick.items = stickyOnly;
			quickPick.selectedItems = stickyOnly;
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
				rememberSelection();
				const items: PickItem[] = hits.map((hit) => ({
					label: hit.name,
					description: hit.version,
					detail: hit.summary || undefined,
					hit,
				}));
				if (!items.some((i) => i.label.toLowerCase() === q.toLowerCase())) {
					items.unshift({
						label: q,
						description: 'install as typed',
						detail: 'Use exact text (name, name==version, git+…, etc.)',
						freeform: true,
					});
				}
				const merged = applySelectionToItems(items);
				quickPick.items = merged;
				quickPick.selectedItems = merged.filter((i) => selectedByKey.has(keyOf(i)));
			} catch {
				if (mySeq !== seq) {
					return;
				}
				rememberSelection();
				const items: PickItem[] = [
					{
						label: q,
						description: 'install as typed',
						detail: 'PyPI search failed — install using the typed name',
						freeform: true,
					},
				];
				const merged = applySelectionToItems(items);
				quickPick.items = merged;
				quickPick.selectedItems = merged.filter((i) => selectedByKey.has(keyOf(i)));
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

	quickPick.onDidChangeSelection((items) => {
		// Rebuild selection map from current selection + keep ones not visible? 
		// Simpler: clear and re-add from selectedItems only would lose sticky off-list.
		// Instead: update map for currently visible items' keys, then set selected ones.
		const visibleKeys = new Set(quickPick.items.map((i) => keyOf(i)));
		// Remove deselected among visible
		for (const key of [...selectedByKey.keys()]) {
			if (visibleKeys.has(key) && !items.some((i) => keyOf(i) === key)) {
				selectedByKey.delete(key);
			}
		}
		for (const item of items) {
			if (item.hit) {
				selectedByKey.set(item.hit.name.toLowerCase(), {
					spec: item.hit.name,
					name: item.hit.name,
					version: item.hit.version,
				});
			} else {
				const typed = item.label.trim();
				if (typed) {
					selectedByKey.set(typed.toLowerCase(), { spec: typed, name: typed });
				}
			}
		}
	});

	const result = await new Promise<PackagePickResult[] | undefined>((resolve) => {
		let settled = false;
		const finish = (value: PackagePickResult[] | undefined) => {
			if (settled) {
				return;
			}
			settled = true;
			resolve(value);
			quickPick.hide();
		};

		const accept = () => {
			rememberSelection();
			// Prefer map (survives search changes); fall back to selectedItems
			const fromMap = [...selectedByKey.values()];
			if (fromMap.length > 0) {
				finish(fromMap);
				return;
			}
			const fromUi = quickPick.selectedItems.map((item) => {
				if (item.hit) {
					return {
						spec: item.hit.name,
						name: item.hit.name,
						version: item.hit.version,
					};
				}
				const typed = (item.label || quickPick.value).trim();
				return { spec: typed, name: typed };
			}).filter((p) => p.spec.length > 0);
			finish(fromUi.length > 0 ? fromUi : undefined);
		};

		quickPick.onDidAccept(accept);
		quickPick.onDidTriggerButton(() => accept());
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

/** @deprecated use pickPackagesToInstall — kept name alias for clarity in call sites if needed */
export async function pickPackageToInstall(
	options?: Parameters<typeof pickPackagesToInstall>[0],
): Promise<PackagePickResult | undefined> {
	const many = await pickPackagesToInstall(options);
	return many?.[0];
}
