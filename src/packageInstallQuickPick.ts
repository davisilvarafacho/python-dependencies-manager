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
 * Multi-select QuickPick with debounced PyPI search (prefix match).
 * Latest version on the right; already-installed packages are hidden.
 */
export async function pickPackagesToInstall(options?: {
	debounceMs?: number;
	/** Lowercase installed package names to hide from results. */
	excludeNames?: ReadonlySet<string>;
	search?: (
		query: string,
		opts?: { limit?: number; excludeNames?: ReadonlySet<string> },
	) => Promise<PypiPackageHit[]>;
	onSearchError?: (message: string) => void;
}): Promise<PackagePickResult[] | undefined> {
	const debounceMs = options?.debounceMs ?? 280;
	const excludeNames = options?.excludeNames ?? new Set<string>();
	const search =
		options?.search ??
		((query, opts) =>
			searchPypiPackages(query, {
				limit: opts?.limit ?? DEFAULT_SEARCH_LIMIT,
				excludeNames: opts?.excludeNames,
				prefixOnly: true,
			}));

	type PickItem = vscode.QuickPickItem & { hit?: PypiPackageHit; freeform?: boolean };

	const quickPick = vscode.window.createQuickPick<PickItem>();
	quickPick.title = 'Install Python packages';
	quickPick.placeholder =
		'Type a prefix (e.g. django-) · multi-select · Enter to install';
	quickPick.canSelectMany = true;
	// Avoid over-filtering description/detail so all prefix hits stay visible.
	quickPick.matchOnDescription = false;
	quickPick.matchOnDetail = false;
	quickPick.ignoreFocusOut = true;
	quickPick.items = [];
	quickPick.busy = false;
	quickPick.buttons = [
		{
			iconPath: new vscode.ThemeIcon('check'),
			tooltip: 'Install selected packages',
		},
	];

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
		const present = new Set(items.map((i) => keyOf(i)));
		const sticky: PickItem[] = [];
		for (const [, pick] of selectedByKey) {
			const key = pick.name.toLowerCase();
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
		return [...sticky, ...items];
	};

	const runSearch = (value: string) => {
		const mySeq = ++seq;
		const q = value.trim();
		if (!q) {
			const stickyOnly = applySelectionToItems([]);
			quickPick.items = stickyOnly;
			quickPick.selectedItems = stickyOnly;
			quickPick.busy = false;
			return;
		}
		quickPick.busy = true;
		void (async () => {
			try {
				const hits = await search(q, {
					limit: DEFAULT_SEARCH_LIMIT,
					excludeNames,
				});
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
				// Free-form only when it looks like a real install target, not a bare prefix.
				const looksLikePrefix = q.endsWith('-') || q.endsWith('.');
				if (
					!looksLikePrefix &&
					!excludeNames.has(q.toLowerCase()) &&
					!items.some((i) => i.label.toLowerCase() === q.toLowerCase())
				) {
					items.unshift({
						label: q,
						description: 'install as typed',
						detail: 'Use exact text (name, name==version, git+…, etc.)',
						freeform: true,
					});
				}
				if (items.length === 0 && stickyOnlyEmpty(selectedByKey)) {
					items.push({
						label: q,
						description: 'no matches',
						detail: `No PyPI packages starting with “${q}” (excluding installed)`,
						freeform: true,
					});
				}
				const merged = applySelectionToItems(items);
				quickPick.items = merged;
				quickPick.selectedItems = merged.filter((i) => selectedByKey.has(keyOf(i)));
			} catch (err) {
				if (mySeq !== seq) {
					return;
				}
				const message = err instanceof Error ? err.message : String(err);
				options?.onSearchError?.(message);
				rememberSelection();
				const items: PickItem[] = [
					{
						label: q,
						description: 'install as typed',
						detail: `PyPI search failed: ${message}`,
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

	const stickyOnlyEmpty = (map: Map<string, PackagePickResult>) => map.size === 0;

	quickPick.onDidChangeValue((value) => {
		if (timer) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => runSearch(value), debounceMs);
	});

	quickPick.onDidChangeSelection((items) => {
		const visibleKeys = new Set(quickPick.items.map((i) => keyOf(i)));
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
				if (typed && item.description !== 'no matches') {
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
			const fromMap = [...selectedByKey.values()].filter(
				(p) => p.spec && p.spec !== 'no matches',
			);
			if (fromMap.length > 0) {
				finish(fromMap);
				return;
			}
			const fromUi = quickPick.selectedItems
				.map((item) => {
					if (item.hit) {
						return {
							spec: item.hit.name,
							name: item.hit.name,
							version: item.hit.version,
						};
					}
					const typed = (item.label || quickPick.value).trim();
					return { spec: typed, name: typed };
				})
				.filter((p) => p.spec.length > 0 && p.spec !== 'no matches');
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
