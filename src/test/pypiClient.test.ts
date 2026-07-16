import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
	DEFAULT_SEARCH_LIMIT,
	clearPypiNameCache,
	filterPackageNames,
	searchPackageNamesFromSimpleIndex,
	searchPypiPackages,
} from '../pypiClient';

suite('filterPackageNames', () => {
	const names = [
		'django',
		'django-filter',
		'django-cors-headers',
		'acdh-django-widgets',
		'requests',
	];

	test('prefixOnly returns only startsWith matches', () => {
		const hits = filterPackageNames(names, 'django-', 50, { prefixOnly: true });
		assert.deepStrictEqual(hits, ['django-filter', 'django-cors-headers']);
	});

	test('excludeNames omits installed', () => {
		const hits = filterPackageNames(names, 'django-', 50, {
			prefixOnly: true,
			excludeNames: new Set(['django-filter']),
		});
		assert.deepStrictEqual(hits, ['django-cors-headers']);
	});
});

suite('searchPypiPackages', () => {
	test('returns empty for blank query', async () => {
		assert.deepStrictEqual(await searchPypiPackages(''), []);
		assert.deepStrictEqual(await searchPypiPackages('   '), []);
	});

	test('django- returns only prefix matches from live/cached index', async function () {
		this.timeout(180_000);
		clearPypiNameCache();
		const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pdm-pypi-'));
		try {
			const names = await searchPackageNamesFromSimpleIndex('django-', DEFAULT_SEARCH_LIMIT, {
				prefixOnly: true,
				cacheDir: tmp,
			});
			if (names.length === 0) {
				this.skip();
			}
			assert.ok(
				names.length >= 50,
				`expected at least 50 names for django-, got ${names.length}`,
			);
			for (const name of names) {
				assert.ok(
					name.toLowerCase().startsWith('django-'),
					`expected prefix django-: ${name}`,
				);
			}
		} catch (err) {
			if (err instanceof Error && /timeout|ENOTFOUND|ECONN|HTTP|challenge/i.test(err.message)) {
				this.skip();
			}
			throw err;
		} finally {
			clearPypiNameCache();
			await fs.rm(tmp, { recursive: true, force: true });
		}
	});

	test('excludeNames omits installed packages', async function () {
		this.timeout(180_000);
		clearPypiNameCache();
		const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pdm-pypi-'));
		try {
			const without = await searchPackageNamesFromSimpleIndex('django-', 20, {
				prefixOnly: true,
				cacheDir: tmp,
			});
			if (without.length === 0) {
				this.skip();
			}
			const banned = without[0].toLowerCase();
			const withExclude = await searchPackageNamesFromSimpleIndex('django-', 20, {
				prefixOnly: true,
				cacheDir: tmp,
				excludeNames: new Set([banned]),
			});
			assert.ok(
				!withExclude.some((n) => n.toLowerCase() === banned),
				`excluded package still present: ${banned}`,
			);
		} catch (err) {
			if (err instanceof Error && /timeout|ENOTFOUND|ECONN|HTTP|challenge/i.test(err.message)) {
				this.skip();
			}
			throw err;
		} finally {
			clearPypiNameCache();
			await fs.rm(tmp, { recursive: true, force: true });
		}
	});
});
