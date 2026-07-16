import * as vscode from 'vscode';
import { filterPackages } from './packagesFilter';
import type { PackageInfo } from './pipService';

export type PackagesWebviewActions = {
	refresh: () => Promise<void>;
	installPackage: () => Promise<void>;
	installFromRequirements: () => Promise<void>;
	updatePackage: (name: string) => Promise<void>;
	uninstallPackage: (name: string) => Promise<void>;
};

/**
 * Activity Bar webview with a sticky search input and package list.
 */
export class PackagesWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'pythonDependenciesManager.packages';

	private view?: vscode.WebviewView;
	private packages: PackageInfo[] = [];
	private status = 'Loading…';
	private filter = '';

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

		webviewView.webview.onDidReceiveMessage(async (msg: { type: string; name?: string; query?: string }) => {
			switch (msg.type) {
				case 'ready':
					await this.reload();
					break;
				case 'filter':
					this.filter = msg.query ?? '';
					this.postState();
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
		});
	}

	/** Reload packages from the backend and update the UI. */
	async reload(): Promise<void> {
		this.status = 'Loading packages…';
		this.postState();
		try {
			this.packages = await this.loadPackages();
			this.status =
				this.packages.length === 0
					? 'No packages in .venv'
					: `${this.packages.length} package(s)`;
		} catch (err) {
			this.packages = [];
			this.status = err instanceof Error ? err.message : String(err);
		}
		this.postState();
	}

	/** Alias used by command handlers after pip mutations. */
	refresh(): void {
		void this.reload();
	}

	private postState(): void {
		if (!this.view) {
			return;
		}
		const filtered = filterPackages(this.packages, this.filter);
		void this.view.webview.postMessage({
			type: 'state',
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
      --gap: 8px;
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
    button.danger:hover {
      filter: brightness(1.05);
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
      <input id="filter" type="search" placeholder="Filter packages…" autocomplete="off" spellcheck="false" />
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
      vscode.postMessage({ type: 'filter', query: filterEl.value });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type !== 'state') return;
      if (typeof msg.filter === 'string' && filterEl.value !== msg.filter) {
        filterEl.value = msg.filter;
      }
      const total = msg.total ?? 0;
      const shown = (msg.packages || []).length;
      metaEl.textContent = msg.status
        + (msg.filter && total ? ' · showing ' + shown + ' of ' + total : '');
      listEl.innerHTML = '';
      if (!msg.packages || msg.packages.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = msg.filter
          ? 'No packages match “' + msg.filter + '”'
          : (msg.status || 'No packages');
        listEl.appendChild(empty);
        return;
      }
      for (const pkg of msg.packages) {
        const row = document.createElement('div');
        row.className = 'row';
        const left = document.createElement('div');
        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = pkg.name;
        const ver = document.createElement('div');
        ver.className = 'version';
        ver.textContent = pkg.version;
        left.appendChild(name);
        left.appendChild(ver);
        const actions = document.createElement('div');
        actions.className = 'actions';
        const up = document.createElement('button');
        up.textContent = 'Update';
        up.title = 'Update package';
        up.addEventListener('click', () => vscode.postMessage({ type: 'update', name: pkg.name }));
        const del = document.createElement('button');
        del.textContent = 'Remove';
        del.className = 'danger';
        del.title = 'Uninstall package';
        del.addEventListener('click', () => vscode.postMessage({ type: 'uninstall', name: pkg.name }));
        actions.appendChild(up);
        actions.appendChild(del);
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
