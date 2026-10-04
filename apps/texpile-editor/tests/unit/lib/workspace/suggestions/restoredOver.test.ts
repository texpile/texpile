// a version from Local History over a file with suggestions: which it removes, which it keeps and where
import { describe, expect, it } from 'vitest';
import { restoredOver } from '$lib/workspace/suggestions/suggestionStates';

const NOW = 'The slow brown fox jumps over the lazy cat.';
// quick -> slow, and dog -> cat, both suggested since the copy
const placed = [
	{ id: 'slow', from: 4, to: 8, restore: 'quick', author: 'Ada' },
	{ id: 'cat', from: 39, to: 42, restore: 'dog', author: 'Ada' }
];

describe('restoredOver', () => {
	it('removes the suggestions the copy does not have, and records nothing else for them', () => {
		const r = restoredOver('main.tex', { text: NOW, placed }, 'The quick brown fox jumps over the lazy dog.');
		expect([...r.dropped].sort()).toEqual(['cat', 'slow']);
		expect(r.placed).toEqual([]);
		expect(r.changes).toEqual([]);
	});

	it('keeps a suggestion the copy still has, where it now stands', () => {
		const r = restoredOver('main.tex', { text: NOW, placed }, 'A slow brown fox jumps over the lazy dog.');
		expect([...r.dropped]).toEqual(['cat']);
		expect(r.placed).toEqual([{ ...placed[0], from: 2, to: 6 }]);
	});
});
