// @vitest-environment jsdom
// The picker's recent symbols live in the texpile:users blob, most recent first. The store hydrates
// at module init, so each case re-imports with localStorage already seeded.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withRecentSymbol } from '$lib/editor/symbols/symbolRecents';

const KEY = 'texpile:users';
const seed = (recentTypstSymbols: unknown) => localStorage.setItem(KEY, JSON.stringify({ v: 1, recentTypstSymbols }));
const stored = () => JSON.parse(localStorage.getItem(KEY)!).recentTypstSymbols;
const load = () => import('$lib/editor/symbols/symbolRecents');

describe('withRecentSymbol', () => {
	it('puts the pick first, once', () => {
		expect(withRecentSymbol(['sym.a', 'sym.b', 'sym.c'], 'sym.c')).toEqual(['sym.c', 'sym.a', 'sym.b']);
		expect(withRecentSymbol(['sym.a'], 'sym.b')).toEqual(['sym.b', 'sym.a']);
	});

	it('keeps two rows of them', () => {
		const many = Array.from({ length: 30 }, (_, i) => `sym.s${i}`);
		const next = withRecentSymbol(many, 'sym.new');
		expect(next).toHaveLength(20);
		expect(next[0]).toBe('sym.new');
		expect(next[19]).toBe('sym.s18');
	});
});

describe('the stored list', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.resetModules();
	});

	it('remembers picks most recent first, across a reload', { timeout: 15000 }, async () => {
		seed(['sym.alpha']);
		const recents = await load();
		recents.rememberSymbol('recentTypstSymbols', 'sym.arrow.r');
		recents.rememberSymbol('recentTypstSymbols', 'sym.alpha');
		expect(recents.recentSymbols('recentTypstSymbols')).toEqual(['sym.alpha', 'sym.arrow.r']);
		expect(stored()).toEqual(['sym.alpha', 'sym.arrow.r']);
		vi.resetModules();
		expect((await load()).recentSymbols('recentTypstSymbols')).toEqual(['sym.alpha', 'sym.arrow.r']);
	});

	it('reads a damaged entry as empty, and keeps the rest of the blob', async () => {
		localStorage.setItem(KEY, JSON.stringify({ v: 1, recentTypstSymbols: 'sym.alpha', recentFolders: ['/a'] }));
		const recents = await load();
		const { userData } = await import('$lib/storage/userData');
		expect(recents.recentSymbols('recentTypstSymbols')).toEqual([]);
		expect(userData.current.recentFolders).toEqual(['/a']);
	});
});
