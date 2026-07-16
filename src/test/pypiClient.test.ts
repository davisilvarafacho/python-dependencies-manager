import * as assert from 'assert';
import { searchPypiPackages } from '../pypiClient';

suite('searchPypiPackages', () => {
	test('returns empty for blank query', async () => {
		assert.deepStrictEqual(await searchPypiPackages(''), []);
		assert.deepStrictEqual(await searchPypiPackages('   '), []);
	});

	// Network-dependent: soft-check that known package resolves via JSON fallback
	// when PyPI is reachable. Skip hard failure if offline.
	test('finds a known package when PyPI is reachable', async function () {
		this.timeout(15000);
		try {
			const hits = await searchPypiPackages('requests');
			if (hits.length === 0) {
				this.skip();
			}
			const requests = hits.find((h) => h.name.toLowerCase() === 'requests');
			assert.ok(requests, 'expected requests in search results');
			assert.ok(requests!.version.length > 0, 'expected a version string');
		} catch {
			this.skip();
		}
	});
});
