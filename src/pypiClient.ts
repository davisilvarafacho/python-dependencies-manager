import * as https from 'https';
import * as http from 'http';

export type PypiPackageHit = {
	name: string;
	version: string;
	summary: string;
};

export const DEFAULT_SEARCH_LIMIT = 50;

export type SearchPypiOptions = {
	limit?: number;
	/** Package names already installed (lowercase) — omitted from results. */
	excludeNames?: ReadonlySet<string>;
	/**
	 * When true (default), only names that *start with* the query are returned
	 * (e.g. `django-` → `django-filter`, not `acdh-django-…`).
	 */
	prefixOnly?: boolean;
};

function httpsGet(url: string, timeoutMs = 20000): Promise<string> {
	return new Promise((resolve, reject) => {
		const req = https.get(
			url,
			{
				headers: {
					'User-Agent': 'pip/24.0 python-dependencies-manager',
					Accept: 'application/json, text/html',
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
			req.destroy();
			reject(new Error(`Timeout fetching ${url}`));
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
 * Stream https://pypi.org/simple/ and collect package names matching query.
 * Default: prefix match only. Stops early once `limit` prefix hits are found.
 */
export function searchPackageNamesFromSimpleIndex(
	query: string,
	limit = DEFAULT_SEARCH_LIMIT,
	options?: {
		excludeNames?: ReadonlySet<string>;
		prefixOnly?: boolean;
	},
): Promise<string[]> {
	const q = query.trim().toLowerCase();
	const prefixOnly = options?.prefixOnly !== false;
	const exclude = options?.excludeNames;

	if (!q) {
		return Promise.resolve([]);
	}

	return new Promise((resolve, reject) => {
		const starts: string[] = [];
		const contains: string[] = [];
		const seen = new Set<string>();
		let buf = '';
		let settled = false;
		let intentionalAbort = false;

		const finish = (names: string[]) => {
			if (settled) {
				return;
			}
			settled = true;
			resolve(names);
		};

		const fail = (err: Error) => {
			if (settled || intentionalAbort) {
				return;
			}
			settled = true;
			reject(err);
		};

		const consider = (rawName: string) => {
			let name: string;
			try {
				name = decodeURIComponent(rawName);
			} catch {
				name = rawName;
			}
			const key = name.toLowerCase();
			if (seen.has(key) || exclude?.has(key)) {
				return;
			}
			// Simple index uses normalized names (usually lowercase with hyphens).
			if (prefixOnly) {
				if (!key.startsWith(q)) {
					return;
				}
				seen.add(key);
				starts.push(name);
				return;
			}
			if (!key.includes(q)) {
				return;
			}
			seen.add(key);
			if (key.startsWith(q)) {
				starts.push(name);
			} else if (contains.length < limit * 2) {
				contains.push(name);
			}
		};

		const req = https.get(
			'https://pypi.org/simple/',
			{
				headers: {
					'User-Agent': 'pip/24.0 python-dependencies-manager',
					Accept: 'text/html',
				},
			},
			(res: http.IncomingMessage) => {
				if (res.statusCode && res.statusCode >= 400) {
					fail(new Error(`HTTP ${res.statusCode} fetching PyPI simple index`));
					res.resume();
					return;
				}
				res.setEncoding('utf8');
				res.on('data', (chunk: string) => {
					if (settled) {
						return;
					}
					buf += chunk;
					const re = /href="\/simple\/([^"/]+)\/"/g;
					let m: RegExpExecArray | null;
					let lastIndex = 0;
					while ((m = re.exec(buf)) !== null) {
						lastIndex = re.lastIndex;
						consider(m[1]);
						if (starts.length >= limit) {
							// Resolve first, then abort stream (avoids race with error handlers).
							finish(starts.slice(0, limit));
							intentionalAbort = true;
							res.destroy();
							req.destroy();
							return;
						}
					}
					if (lastIndex > 0) {
						buf = buf.slice(lastIndex);
					} else if (buf.length > 50_000) {
						buf = buf.slice(-2_000);
					}
				});
				res.on('end', () => {
					if (prefixOnly) {
						finish(starts.slice(0, limit));
					} else {
						finish([...starts, ...contains].slice(0, limit));
					}
				});
				res.on('error', (err) => {
					if (intentionalAbort || settled) {
						return;
					}
					fail(err instanceof Error ? err : new Error(String(err)));
				});
			},
		);
		req.setTimeout(180_000, () => {
			if (!settled) {
				intentionalAbort = true;
				req.destroy();
				fail(new Error('Timeout streaming PyPI simple index'));
			}
		});
		req.on('error', (err) => {
			if (intentionalAbort || settled) {
				return;
			}
			fail(err instanceof Error ? err : new Error(String(err)));
		});
	});
}

async function enrichNamesWithMetadata(
	names: string[],
	concurrency = 10,
): Promise<PypiPackageHit[]> {
	const hits: PypiPackageHit[] = [];
	for (let i = 0; i < names.length; i += concurrency) {
		const batch = names.slice(i, i + concurrency);
		const part = await Promise.all(
			batch.map(async (name) => {
				const meta = await fetchPypiPackage(name);
				return (
					meta ?? {
						name,
						version: '…',
						summary: '',
					}
				);
			}),
		);
		hits.push(...part);
	}
	return hits;
}

/**
 * Search PyPI package names (simple index) and attach latest version.
 * By default: prefix match, 50 results, optional exclude of installed packages.
 */
export async function searchPypiPackages(
	query: string,
	limitOrOptions: number | SearchPypiOptions = DEFAULT_SEARCH_LIMIT,
): Promise<PypiPackageHit[]> {
	const opts: SearchPypiOptions =
		typeof limitOrOptions === 'number'
			? { limit: limitOrOptions }
			: limitOrOptions;

	const q = query.trim();
	const limit = opts.limit ?? DEFAULT_SEARCH_LIMIT;
	const prefixOnly = opts.prefixOnly !== false;

	if (q.length < 1) {
		return [];
	}

	const names = await searchPackageNamesFromSimpleIndex(q, limit, {
		excludeNames: opts.excludeNames,
		prefixOnly,
	});

	if (names.length === 0) {
		// Exact lookup only when the typed name is a real package (not a bare prefix like "django-")
		if (!q.endsWith('-') && !opts.excludeNames?.has(q.toLowerCase())) {
			const exact = await fetchPypiPackage(q);
			return exact ? [exact] : [];
		}
		return [];
	}

	return enrichNamesWithMetadata(names);
}
