import * as https from 'https';

export type PypiPackageHit = {
	name: string;
	version: string;
	summary: string;
};

export const DEFAULT_SEARCH_LIMIT = 50;

function httpsGet(url: string, timeoutMs = 15000): Promise<string> {
	return new Promise((resolve, reject) => {
		const req = https.get(
			url,
			{
				headers: {
					// pip-like UA avoids warehouse HTML bot challenges on API endpoints
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
 * Stream https://pypi.org/simple/ and collect package names matching query
 * (substring, case-insensitive). Prefers names that *start with* the query.
 * Stops early once enough prefix matches are found.
 */
export function searchPackageNamesFromSimpleIndex(
	query: string,
	limit = DEFAULT_SEARCH_LIMIT,
): Promise<string[]> {
	const q = query.trim().toLowerCase();
	if (!q) {
		return Promise.resolve([]);
	}

	return new Promise((resolve, reject) => {
		const starts: string[] = [];
		const contains: string[] = [];
		const seen = new Set<string>();
		let buf = '';
		let settled = false;

		const finish = (names: string[]) => {
			if (settled) {
				return;
			}
			settled = true;
			resolve(names);
		};

		const consider = (rawName: string) => {
			const name = decodeURIComponent(rawName);
			const key = name.toLowerCase();
			if (seen.has(key)) {
				return;
			}
			if (!key.includes(q)) {
				return;
			}
			seen.add(key);
			if (key.startsWith(q)) {
				starts.push(name);
			} else if (contains.length < limit * 3) {
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
			(res) => {
				if (res.statusCode && res.statusCode >= 400) {
					reject(new Error(`HTTP ${res.statusCode} fetching PyPI simple index`));
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
							res.destroy();
							finish(starts.slice(0, limit));
							return;
						}
					}
					if (lastIndex > 0) {
						buf = buf.slice(lastIndex);
					} else if (buf.length > 50_000) {
						// No complete anchor yet — keep a tail only
						buf = buf.slice(-2_000);
					}
				});
				res.on('end', () => {
					finish([...starts, ...contains].slice(0, limit));
				});
				res.on('error', (err) => {
					if (!settled) {
						reject(err);
					}
				});
			},
		);
		req.setTimeout(180_000, () => {
			req.destroy(new Error('Timeout streaming PyPI simple index'));
		});
		req.on('error', (err) => {
			if (!settled) {
				reject(err);
			}
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
						version: '?',
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
 * Search PyPI package names (via simple index) and attach latest version.
 * Default limit is 50 so queries like `django-` return a rich list.
 */
export async function searchPypiPackages(
	query: string,
	limit = DEFAULT_SEARCH_LIMIT,
): Promise<PypiPackageHit[]> {
	const q = query.trim();
	if (q.length < 1) {
		return [];
	}

	const names = await searchPackageNamesFromSimpleIndex(q, limit);
	if (names.length === 0) {
		const exact = await fetchPypiPackage(q);
		return exact ? [exact] : [];
	}

	return enrichNamesWithMetadata(names);
}
