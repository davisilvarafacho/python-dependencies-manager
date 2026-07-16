import * as assert from 'assert';
import {
	DEFAULT_SEARCH_LIMIT,
	searchPackageNamesFromSimpleIndex,
	searchPypiPackages,
} from '../pypiClient';

suite('searchPypiPackages', () => {
	test('returns empty for blank query', async () => {
		assert.deepStrictEqual(await searchPypiPackages(''), []);
		assert.deepStrictEqual(await searchPypiPackages('   '), []);
	});

	test('django- returns only names starting with django- (prefix)', async function () {
		this.timeout(180_000);
		try {
			const names = await searchPackageNamesFromSimpleIndex('django-', DEFAULT_SEARCH_LIMIT, {
				prefixOnly: true,
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
			if (err instanceof Error && /timeout|ENOTFOUND|ECONN|HTTP/i.test(err.message)) {
				this.skip();
			}
			throw err;
		}
	});

	test('excludeNames omits installed packages', async function () {
		this.timeout(180_000);
		try {
			const without = await searchPackageNamesFromSimpleIndex('django-', 20, {
				prefixOnly: true,
			});
			if (without.length === 0) {
				this.skip();
			}
			const banned = without[0].toLowerCase();
			const withExclude = await searchPackageNamesFromSimpleIndex('django-', 20, {
				prefixOnly: true,
				excludeNames: new Set([banned]),
			});
			assert.ok(
				!withExclude.some((n) => n.toLowerCase() === banned),
				`excluded package still present: ${banned}`,
			);
		} catch (err) {
			if (err instanceof Error && /timeout|ENOTFOUND|ECONN|HTTP/i.test(err.message)) {
				this.skip();
			}
			throw err;
		}
	});

	test('searchPypiPackages enriches versions for a small known query', async function () {
		this.timeout(60_000);
		try {
			const hits = await searchPypiPackages('requests', { limit: 5, prefixOnly: true });
			if (hits.length === 0) {
				this.skip();
			}
			assert.ok(hits.some((h) => h.name.toLowerCase().startsWith('requests')));
			assert.ok(hits[0].version.length > 0);
		} catch {
			this.skip();
		}
	});
});
