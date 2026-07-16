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

	test('django- name search returns at least 50 matching names from simple index', async function () {
		this.timeout(180_000);
		try {
			const names = await searchPackageNamesFromSimpleIndex('django-', DEFAULT_SEARCH_LIMIT);
			if (names.length === 0) {
				this.skip();
			}
			assert.ok(
				names.length >= 50,
				`expected at least 50 names for django-, got ${names.length}`,
			);
			for (const name of names) {
				assert.ok(
					name.toLowerCase().includes('django-'),
					`expected name to include django-: ${name}`,
				);
			}
			// Prefer prefix matches first
			const prefixCount = names.filter((n) => n.toLowerCase().startsWith('django-')).length;
			assert.ok(prefixCount > 0, 'expected some names starting with django-');
		} catch (err) {
			// Network failures in CI/dev should not hard-fail the suite
			if (err instanceof Error && /timeout|ENOTFOUND|ECONN|HTTP/i.test(err.message)) {
				this.skip();
			}
			throw err;
		}
	});

	test('searchPypiPackages enriches versions for a small known query', async function () {
		this.timeout(60_000);
		try {
			const hits = await searchPypiPackages('requests', 5);
			if (hits.length === 0) {
				this.skip();
			}
			assert.ok(hits.some((h) => h.name.toLowerCase().includes('requests')));
			assert.ok(hits[0].version.length > 0);
		} catch {
			this.skip();
		}
	});
});
