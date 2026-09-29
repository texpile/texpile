// Compare with Previous reads the entry saved just before the one clicked. The window's list is
// newest first (listLocalHistory reverses what is kept oldest first), and reading it the other way
// round compared a save with the one after it, and offered nothing for the newest.
import { it, expect } from 'vitest';
import { entryBefore } from '$lib/workspace/localHistory/localHistory.svelte';

const newestFirst = [
	{ id: 'cccc.tex', timestamp: 3 },
	{ id: 'bbbb.tex', timestamp: 2 },
	{ id: 'aaaa.tex', timestamp: 1 }
];

it('finds the save before, and none before the first', () => {
	expect(entryBefore(newestFirst, 'cccc.tex')?.id).toBe('bbbb.tex');
	expect(entryBefore(newestFirst, 'bbbb.tex')?.id).toBe('aaaa.tex');
	expect(entryBefore(newestFirst, 'aaaa.tex')).toBeNull();
	expect(entryBefore(newestFirst, 'gone.tex')).toBeNull();
});
