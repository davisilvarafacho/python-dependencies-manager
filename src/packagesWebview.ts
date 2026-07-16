import * as vscode from 'vscode';
import { filterPackages } from './packagesFilter';
import type { PackageInfo } from './pipService';
import { DEFAULT_SEARCH_LIMIT, searchPypiPackages, type PypiPackageHit } from './pypiClient';

export type PackagesWebviewActions = {
	refresh: () => Promise<void>;
	installPackage: () => Promise<void>;
	installFromRequirements: () => Promise<void>;
	/** Install a concrete package name/spec from PyPI search results. */
	installNamedPackage: (spec: string) => Promise<void>;
	updatePackage: (name: string) => Promise<void>;
	uninstallPackage: (name: string) => Promise<void>;
};

type ViewMode = 'installed' | 'search';

/**
 * Activity Bar webview with a sticky search input.
 * Empty query → installed packages; non-empty → real PyPI name search (≥50 hits).
 */
export class PackagesWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'pythonDependenciesManager.packages';

	private view?: vscode.WebviewView;
	private packages: PackageInfo[] = [];
	private searchHits: PypiPackageHit[] = [];
	private status = 'Loading…';
	private filter = '';
	private mode: ViewMode = 'installed';
	private searchSeq = 0;
	private searchTimer?: NodeJS.Timeout;

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly loadPackages: () => Promise<PackageInfo[]>,
		private readonly actions: PackagesWebviewActions,
	) {}

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	): void {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri],
		};
		webviewView.webview.html = this.getHtml(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(
			async (msg: { type: string; name?: string; query?: string; spec?: string }) => {
				switch (msg.type) {
					case 'ready':
						await this.reload();
						break;
					case 'query':
						this.onQueryChanged(msg.query ?? '');
						break;
					case 'refresh':
						await this.actions.refresh();
						break;
					case 'install':
						await this.actions.installPackage();
						break;
					case 'installFromRequirements':
						await this.actions.installFromRequirements();
						break;
					case 'installSpec':
						if (msg.spec) {
							await this.actions.installNamedPackage(msg.spec);
						}
						break;
					case 'update':
						if (msg.name) {
							await this.actions.updatePackage(msg.name);
						}
						break;
					case 'uninstall':
						if (msg.name) {
							await this.actions.uninstallPackage(msg.name);
						}
						break;
					default:
						break;
				}
			},
		);
	}

	async reload(): Promise<void> {
		this.status = 'Loading packages…';
		this.postState();
		try {
			this.packages = await this.loadPackages();
			if (this.mode === 'installed') {
				this.status =
					this.packages.length === 0
						? 'No packages in .venv'
						: `${this.packages.length} installed package(s)`;
			}
		} catch (err) {
			this.packages = [];
			if (this.mode === 'installed') {
				this.status = err instanceof Error ? err.message : String(err);
			}
		}
		this.postState();
	}

	refresh(): void {
		void this.reload();
	}

	private onQueryChanged(query: string): void {
		this.filter = query;
		const q = query.trim();
		if (!q) {
			if (this.searchTimer) {
				clearTimeout(this.searchTimer);
			}
			this.mode = 'installed';
			this.searchHits = [];
			this.status =
				this.packages.length === 0
					? 'No packages in .venv'
					: `${this.packages.length} installed package(s)`;
			this.postState();
			return;
		}

		this.mode = 'search';
		this.status = `Searching PyPI for “${q}”…`;
		this.postState();

		if (this.searchTimer) {
			clearTimeout(this.searchTimer);
		}
		const mySeq = ++this.searchSeq;
		this.searchTimer = setTimeout(() => {
			void this.runPypiSearch(q, mySeq);
		}, 320);
	}

	private async runPypiSearch(q: string, seq: number): Promise<void> {
		try {
			const hits = await searchPypiPackages(q, DEFAULT_SEARCH_LIMIT);
			if (seq !== this.searchSeq) {
				return;
			}
			this.searchHits = hits;
			this.status =
				hits.length === 0
					? `No PyPI packages matching “${q}”`
					: `${hits.length} PyPI result(s) for “${q}” (name contains query)`;
			this.postState();
		} catch (err) {
			if (seq !== this.searchSeq) {
				return;
			}
			this.searchHits = [];
			this.status = `PyPI search failed: ${err instanceof Error ? err.message : String(err)}`;
			this.postState();
		}
	}

	private postState(): void {
		if (!this.view) {
			return;
		}
		if (this.mode === 'search') {
			void this.view.webview.postMessage({
				type: 'state',
				mode: 'search',
				packages: this.searchHits,
				total: this.searchHits.length,
				filter: this.filter,
				status: this.status,
			});
			return;
		}

		const filtered = filterPackages(this.packages, this.filter);
		void this.view.webview.postMessage({
			type: 'state',
			mode: 'installed',
			packages: filtered,
			total: this.packages.length,
			filter: this.filter,
			status: this.status,
		});
	}

	private getHtml(webview: vscode.Webview): string {
		const csp = [
			`default-src 'none'`,
			`style-src ${webview.cspSource} 'unsafe-inline'`,
			`script-src ${webview.cspSource} 'unsafe-inline'`,
		].join('; ');

		return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Python Packages</title>
  <style>
    :root {
      color-scheme: light dark;
      --pad: 10px;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
    }
    .wrap {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .search-bar {
      position: sticky;
      top: 0;
      z-index: 2;
      padding: var(--pad);
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35));
    }
    .search-bar input {
      width: 100%;
      padding: 6px 10px;
      border: 1px solid var(--vscode-input-border, transparent);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      outline: none;
      border-radius: 2px;
    }
    .search-bar input:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    .hint {
      margin-top: 6px;
      opacity: 0.7;
      font-size: 0.85em;
    }
    .meta {
      padding: 4px var(--pad) 0;
      opacity: 0.75;
      font-size: 0.9em;
    }
    .list {
      flex: 1;
      overflow: auto;
      padding: 4px 0 var(--pad);
    }
    .row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 6px;
      align-items: center;
      padding: 6px var(--pad);
      border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.15));
    }
    .row:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .name {
      font-weight: 600;
      word-break: break-all;
    }
    .version {
      opacity: 0.8;
      font-size: 0.9em;
      margin-top: 2px;
    }
    .summary {
      opacity: 0.65;
      font-size: 0.85em;
      margin-top: 2px;
    }
    .actions {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }
    button {
      border: none;
      background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
      color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
      padding: 3px 8px;
      cursor: pointer;
      border-radius: 2px;
      font-size: 0.85em;
    }
    button:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground));
    }
    .empty {
      padding: var(--pad);
      opacity: 0.8;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="search-bar">
      <input id="filter" type="search" placeholder="Search PyPI (e.g. django-)…" autocomplete="off" spellcheck="false" />
      <div class="hint">Empty = installed packages · Type to search PyPI by name (≥50 results)</div>
    </div>
    <div class="meta" id="meta"></div>
    <div class="list" id="list"></div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const filterEl = document.getElementById('filter');
    const listEl = document.getElementById('list');
    const metaEl = document.getElementById('meta');

    filterEl.addEventListener('input', () => {
      vscode.postMessage({ type: 'query', query: filterEl.value });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type !== 'state') return;
      if (typeof msg.filter === 'string' && filterEl.value !== msg.filter) {
        filterEl.value = msg.filter;
      }
      metaEl.textContent = msg.status || '';
      listEl.innerHTML = '';
      const pkgs = msg.packages || [];
      if (pkgs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = msg.status || 'No packages';
        listEl.appendChild(empty);
        return;
      }
      const isSearch = msg.mode === 'search';
      for (const pkg of pkgs) {
        const row = document.createElement('div');
        row.className = 'row';
        const left = document.createElement('div');
        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = pkg.name;
        const ver = document.createElement('div');
        ver.className = 'version';
        ver.textContent = pkg.version || '';
        left.appendChild(name);
        left.appendChild(ver);
        if (pkg.summary) {
          const sum = document.createElement('div');
          sum.className = 'summary';
          sum.textContent = pkg.summary;
          left.appendChild(sum);
        }
        const actions = document.createElement('div');
        actions.className = 'actions';
        if (isSearch) {
          const add = document.createElement('button');
          add.textContent = 'Install';
          add.title = 'Install from PyPI';
          add.addEventListener('click', () =>
            vscode.postMessage({ type: 'installSpec', spec: pkg.name })
          );
          actions.appendChild(add);
        } else {
          const up = document.createElement('button');
          up.textContent = 'Update';
          up.addEventListener('click', () =>
            vscode.postMessage({ type: 'update', name: pkg.name })
          );
          const del = document.createElement('button');
          del.textContent = 'Remove';
          del.addEventListener('click', () =>
            vscode.postMessage({ type: 'uninstall', name: pkg.name })
          );
          actions.appendChild(up);
          actions.appendChild(del);
        }
        row.appendChild(left);
        row.appendChild(actions);
        listEl.appendChild(row);
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
	}
}
