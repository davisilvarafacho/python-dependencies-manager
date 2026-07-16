import * as https from 'https';

export type PypiPackageHit = {
	name: string;
	version: string;
	summary: string;
};

function httpsGet(url: string, timeoutMs = 8000): Promise<string> {
	return new Promise((resolve, reject) => {
		const req = https.get(
			url,
			{
				headers: {
					'User-Agent': 'python-dependencies-manager-vscode/0.0.1',
					Accept: 'text/html,application/json',
				},
			},
			(res) => {
				if (
					res.statusCode &&
					res.statusCode >= 300 &&
					res.statusCode < 400 &&
					res.headers.location
				) {
					const next = res.headers.location.startsWith('http')
						? res.headers.location
						: new URL(res.headers.location, url).toString();
					httpsGet(next, timeoutMs).then(resolve, reject);
					res.resume();
					return;
				}
				if (res.statusCode && res.statusCode >= 400) {
					reject(new Error(`HTTP ${res.statusCode} for ${url}`));
					res.resume();
					return;
				}
				const chunks: Buffer[] = [];
				res.on('data', (c) => chunks.push(c as Buffer));
				res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
			},
		);
		req.setTimeout(timeoutMs, () => {
			req.destroy(new Error(`Timeout fetching ${url}`));
		});
		req.on('error', reject);
	});
}

/**
 * Fetch latest version + summary for an exact package name via PyPI JSON API.
 */
export async function fetchPypiPackage(
	name: string,
): Promise<PypiPackageHit | undefined> {
	const trimmed = name.trim();
	if (!trimmed) {
		return undefined;
	}
	try {
		const body = await httpsGet(
			`https://pypi.org/pypi/${encodeURIComponent(trimmed)}/json`,
		);
		const data = JSON.parse(body) as {
			info?: { name?: string; version?: string; summary?: string };
		};
		const info = data.info;
		if (!info?.name || !info.version) {
			return undefined;
		}
		return {
			name: info.name,
			version: info.version,
			summary: info.summary ?? '',
		};
	} catch {
		return undefined;
	}
}

/**
 * Search PyPI (HTML search page) and return name + version + summary.
 * Falls back to exact JSON lookup when search returns nothing.
 */
export async function searchPypiPackages(
	query: string,
	limit = 20,
): Promise<PypiPackageHit[]> {
	const q = query.trim();
	if (q.length < 1) {
		return [];
	}

	const hits: PypiPackageHit[] = [];
	const seen = new Set<string>();

	const push = (hit: PypiPackageHit) => {
		const key = hit.name.toLowerCase();
		if (seen.has(key)) {
			return;
		}
		seen.add(key);
		hits.push(hit);
	};

	try {
		const html = await httpsGet(
			`https://pypi.org/search/?q=${encodeURIComponent(q)}&o=`,
		);
		// package-snippet blocks from warehouse search results
		const blockRe =
			/<a[^>]*class="package-snippet"[^>]*>[\s\S]*?<\/a>/gi;
		const nameRe = /package-snippet__name[^>]*>([^<]+)</i;
		const versionRe = /package-snippet__version[^>]*>([^<]+)</i;
		const descRe = /package-snippet__description[^>]*>([^<]*)</i;

		const blocks = html.match(blockRe) ?? [];
		for (const block of blocks) {
			if (hits.length >= limit) {
				break;
			}
			const name = block.match(nameRe)?.[1]?.trim();
			const version = block.match(versionRe)?.[1]?.trim();
			const summary = block.match(descRe)?.[1]?.trim() ?? '';
			if (name && version) {
				push({ name, version, summary });
			}
		}
	} catch {
		// fall through to exact lookup
	}

	// Always try exact name so typing a full package still works offline of search HTML.
	if (hits.length < limit) {
		const exact = await fetchPypiPackage(q);
		if (exact) {
			push(exact);
		}
	}

	return hits.slice(0, limit);
}
