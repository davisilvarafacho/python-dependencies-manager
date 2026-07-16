import * as fs from 'fs/promises';
import * as https from 'https';
import * as path from 'path';

export type PypiPackageHit = {
	name: string;
	version: string;
	summary: string;
};

export const DEFAULT_SEARCH_LIMIT = 50;

/** In-memory cache of PyPI project names (lowercase for matching, original casing preserved). */
let memoryNames: { names: string[]; fetchedAt: number } | null = null;
const MEMORY_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const DISK_CACHE_FILE = 'pypi-simple-names.txt';
const DISK_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export type SearchPypiOptions = {
	limit?: number;
	/** Package names already installed (lowercase) — omitted from results. */
	excludeNames?: ReadonlySet<string>;
	/**
	 * When true (default), only names that *start with* the query are returned
	 * (e.g. `django-` → `django-filter`).
	 */
	prefixOnly?: boolean;
	/** Directory for on-disk name index cache (extension globalStorage). */
	cacheDir?: string;
};

function httpsGet(url: string, headers: Record<string, string>, timeoutMs = 120_000): Promise<string> {
	return new Promise((resolve, reject) => {
		const req = https.get(
			url,
			{
				headers: {
					'User-Agent': 'pip/24.0 python-dependencies-manager',
					...headers,
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
					httpsGet(next, headers, timeoutMs).then(resolve, reject);
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
			{ Accept: 'application/json' },
			20_000,
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

function looksLikeCloudflareChallenge(body: string): boolean {
	return (
		body.includes('Client Challenge') ||
		body.includes('JS Exception') ||
		body.includes('_fs-ch-') ||
		body.includes('Just a moment')
	);
}

/**
 * Download PyPI project names via PEP 691 JSON simple API
 * (avoids HTML/Cloudflare JS challenge on /simple/).
 */
export async function fetchAllPypiProjectNames(): Promise<string[]> {
	const body = await httpsGet(
		'https://pypi.org/simple/',
		{
			// PEP 691 — JSON simple index
			Accept: 'application/vnd.pypi.simple.v1+json',
		},
		180_000,
	);

	if (looksLikeCloudflareChallenge(body)) {
		throw new Error(
			'PyPI returned a browser challenge page instead of the package index. Try again later or check network/proxy.',
		);
	}

	let data: { projects?: Array<{ name?: string } | string> };
	try {
		data = JSON.parse(body) as { projects?: Array<{ name?: string } | string> };
	} catch {
		throw new Error(
			'Failed to parse PyPI simple index JSON (unexpected response body).',
		);
	}

	const projects = data.projects;
	if (!Array.isArray(projects) || projects.length === 0) {
		throw new Error('PyPI simple index JSON contained no projects.');
	}

	const names: string[] = [];
	for (const p of projects) {
		if (typeof p === 'string' && p.trim()) {
			names.push(p.trim());
		} else if (p && typeof p === 'object' && typeof p.name === 'string' && p.name.trim()) {
			names.push(p.name.trim());
		}
	}
	if (names.length === 0) {
		throw new Error('PyPI simple index had projects but no usable names.');
	}
	return names;
}

async function readDiskCache(cacheDir: string): Promise<string[] | undefined> {
	const file = path.join(cacheDir, DISK_CACHE_FILE);
	const metaFile = path.join(cacheDir, DISK_CACHE_FILE + '.meta');
	try {
		const metaRaw = await fs.readFile(metaFile, 'utf8');
		const meta = JSON.parse(metaRaw) as { fetchedAt?: number };
		if (!meta.fetchedAt || Date.now() - meta.fetchedAt > DISK_TTL_MS) {
			return undefined;
		}
		const text = await fs.readFile(file, 'utf8');
		const names = text.split('\n').filter(Boolean);
		return names.length > 0 ? names : undefined;
	} catch {
		return undefined;
	}
}

async function writeDiskCache(cacheDir: string, names: string[]): Promise<void> {
	try {
		await fs.mkdir(cacheDir, { recursive: true });
		const file = path.join(cacheDir, DISK_CACHE_FILE);
		const metaFile = path.join(cacheDir, DISK_CACHE_FILE + '.meta');
		await fs.writeFile(file, names.join('\n') + '\n', 'utf8');
		await fs.writeFile(
			metaFile,
			JSON.stringify({ fetchedAt: Date.now(), count: names.length }),
			'utf8',
		);
	} catch {
		// Cache is best-effort
	}
}

/**
 * Return cached PyPI names (memory → disk → network).
 */
export async function getPypiProjectNames(cacheDir?: string): Promise<string[]> {
	if (memoryNames && Date.now() - memoryNames.fetchedAt < MEMORY_TTL_MS) {
		return memoryNames.names;
	}

	if (cacheDir) {
		const fromDisk = await readDiskCache(cacheDir);
		if (fromDisk) {
			memoryNames = { names: fromDisk, fetchedAt: Date.now() };
			return fromDisk;
		}
	}

	const names = await fetchAllPypiProjectNames();
	memoryNames = { names, fetchedAt: Date.now() };
	if (cacheDir) {
		void writeDiskCache(cacheDir, names);
	}
	return names;
}

/** Clear in-memory index (tests / force refresh). */
export function clearPypiNameCache(): void {
	memoryNames = null;
}

/**
 * Filter package names by query (default: prefix match).
 */
export function filterPackageNames(
	names: string[],
	query: string,
	limit = DEFAULT_SEARCH_LIMIT,
	options?: {
		excludeNames?: ReadonlySet<string>;
		prefixOnly?: boolean;
	},
): string[] {
	const q = query.trim().toLowerCase();
	if (!q) {
		return [];
	}
	const prefixOnly = options?.prefixOnly !== false;
	const exclude = options?.excludeNames;
	const out: string[] = [];

	for (const name of names) {
		const key = name.toLowerCase();
		if (exclude?.has(key)) {
			continue;
		}
		const ok = prefixOnly ? key.startsWith(q) : key.includes(q);
		if (!ok) {
			continue;
		}
		out.push(name);
		if (out.length >= limit) {
			break;
		}
	}
	return out;
}

/**
 * Search package names via cached simple index (prefix by default).
 */
export async function searchPackageNamesFromSimpleIndex(
	query: string,
	limit = DEFAULT_SEARCH_LIMIT,
	options?: {
		excludeNames?: ReadonlySet<string>;
		prefixOnly?: boolean;
		cacheDir?: string;
	},
): Promise<string[]> {
	const q = query.trim();
	if (!q) {
		return [];
	}
	const all = await getPypiProjectNames(options?.cacheDir);
	return filterPackageNames(all, q, limit, {
		excludeNames: options?.excludeNames,
		prefixOnly: options?.prefixOnly,
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
 * Search PyPI package names and attach latest version.
 * Uses PEP 691 JSON index + local cache (not HTML scrape).
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
		cacheDir: opts.cacheDir,
	});

	if (names.length === 0) {
		if (!q.endsWith('-') && !opts.excludeNames?.has(q.toLowerCase())) {
			const exact = await fetchPypiPackage(q);
			return exact ? [exact] : [];
		}
		return [];
	}

	return enrichNamesWithMetadata(names);
}
