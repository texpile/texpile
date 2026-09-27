// @vitest-environment jsdom
//
// The recents MRU lives in the texpile:users blob now. The store hydrates at MODULE INIT, so each
// case re-imports with localStorage already seeded - the only way to catch init-order bugs (the
// original motivation: a TDZ read at init once made the list come back empty every launch, and the
// first folder opened then overwrote the whole history).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'texpile:users';
const seed = (recentFolders: unknown) => localStorage.setItem(KEY, JSON.stringify({ v: 1, recentFolders }));
const stored = () => JSON.parse(localStorage.getItem(KEY)!).recentFolders;
const load = () => import('$lib/storage/userData');

describe('recentFolders', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.resetModules();
	});

	// 15s: the first case pays the whole module graph's dynamic-import cost, which crosses the
	// default 5s under a fully parallel suite run
	it('hydrates from the users blob at module init', { timeout: 15000 }, async () => {
		seed(['/a', '/b', '/c']);
		const { userData } = await load();
		expect(userData.current.recentFolders).toEqual(['/a', '/b', '/c']);
	});

	it('prepends a newly opened folder without losing the history', async () => {
		seed(['/a', '/b']);
		const { userData, addRecentFolder } = await load();
		addRecentFolder('/c');
		expect(userData.current.recentFolders).toEqual(['/c', '/a', '/b']);
		expect(stored()).toEqual(['/c', '/a', '/b']);
	});

	it('moves a folder already in the list to the front rather than duplicating it', async () => {
		seed(['/a', '/b', '/c']);
		const { userData, addRecentFolder } = await load();
		addRecentFolder('/c');
		expect(userData.current.recentFolders).toEqual(['/c', '/a', '/b']);
	});

	it('caps the list on read as well as write', async () => {
		seed(Array.from({ length: 20 }, (_, i) => `/f${i}`));
		const { userData, addRecentFolder } = await load();
		expect(userData.current.recentFolders).toHaveLength(10);
		addRecentFolder('/new');
		expect(userData.current.recentFolders).toHaveLength(10);
		expect(userData.current.recentFolders[0]).toBe('/new');
	});

	it('removes a folder and persists the shorter list', async () => {
		seed(['/a', '/b', '/c']);
		const { userData, removeRecentFolder } = await load();
		removeRecentFolder('/b');
		expect(userData.current.recentFolders).toEqual(['/a', '/c']);
		expect(stored()).toEqual(['/a', '/c']);
	});

	it('leaves the list alone when removing a folder it does not have', async () => {
		seed(['/a']);
		const { userData, removeRecentFolder } = await load();
		const before = userData.current;
		removeRecentFolder('/nope');
		expect(userData.current).toBe(before);
	});

	it('survives junk in storage rather than throwing at import', async () => {
		localStorage.setItem(KEY, '{not json');
		const { userData } = await load();
		expect(userData.current.recentFolders).toEqual([]);
	});

	it('drops non-string entries', async () => {
		seed(['/a', 42, null, '/b']);
		const { userData } = await load();
		expect(userData.current.recentFolders).toEqual(['/a', '/b']);
	});
});
