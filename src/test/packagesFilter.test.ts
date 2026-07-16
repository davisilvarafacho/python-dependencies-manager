import * as assert from 'assert';
import { filterPackages } from '../packagesFilter';

suite('filterPackages', () => {
	const pkgs = [
		{ name: 'requests', version: '2.32.0' },
		{ name: 'Django', version: '5.0.1' },
		{ name: 'six', version: '1.16.0' },
	];

	test('empty query returns all', () => {
		assert.deepStrictEqual(filterPackages(pkgs, ''), pkgs);
		assert.deepStrictEqual(filterPackages(pkgs, '   '), pkgs);
	});

	test('filters by name case-insensitively', () => {
		assert.deepStrictEqual(filterPackages(pkgs, 'dj'), [
			{ name: 'Django', version: '5.0.1' },
		]);
	});

	test('filters by version substring', () => {
		assert.deepStrictEqual(filterPackages(pkgs, '1.16'), [
			{ name: 'six', version: '1.16.0' },
		]);
	});
});
