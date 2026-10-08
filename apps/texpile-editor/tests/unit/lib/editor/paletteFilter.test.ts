// The command palette's matcher. Subsequence matching is the whole reason a palette feels fast, and
// the failure modes are quiet: a wrong ranking just means the command you wanted is third, which
// nobody reports as a bug. So the ordering rules get pinned down here.
import { describe, it, expect } from 'vitest';
import { fuzzyScore, highlightRuns } from '$lib/palette/paletteFilter';

/** rank a list the way the palette does, best first */
function order(items: string[], query: string): string[] {
	return items
		.map((text) => ({ text, m: fuzzyScore(text, query) }))
		.filter((r) => r.m)
		.sort((a, b) => b.m!.score - a.m!.score)
		.map((r) => r.text);
}

describe('fuzzyScore', () => {
	it('matches a subsequence, not just a substring', () => {
		expect(fuzzyScore('Open folder', 'opf')).not.toBeNull();
		expect(fuzzyScore('chapters/section-2.tex', 'sec2')).not.toBeNull();
	});

	it('rejects characters that are not there, and respects order', () => {
		expect(fuzzyScore('Compile', 'xyz')).toBeNull();
		expect(fuzzyScore('Compile', 'elipmoc')).toBeNull();
	});

	it('is case insensitive', () => {
		expect(fuzzyScore('Show terminal', 'TERM')).not.toBeNull();
	});

	it('matches everything on an empty query, so an unfiltered list keeps its own order', () => {
		expect(fuzzyScore('anything', '')).toEqual({ score: 0, hits: [] });
	});

	it('prefers a run over scattered letters', () => {
		const run = fuzzyScore('Save', 'sav')!;
		const scattered = fuzzyScore('Show a view', 'sav')!;
		expect(run.score).toBeGreaterThan(scattered.score);
	});

	it('prefers word starts', () => {
		// 'ft' as two word initials beats 'ft' buried inside one word
		const initials = fuzzyScore('Format text', 'ft')!;
		const buried = fuzzyScore('shifted', 'ft')!;
		expect(initials.score).toBeGreaterThan(buried.score);
	});

	it('breaks ties toward the shorter label', () => {
		expect(order(['Save', 'Save and compile everything now'], 'save')[0]).toBe('Save');
	});

	it('ranks the obvious command first for a typical query', () => {
		expect(order(['Configure compile command', 'Compile', 'New terminal'], 'comp')[0]).toBe('Compile');
		// 'term' is a word start in both terminal commands, so both survive; only the sidebar drops
		expect(order(['Show sidebar', 'Show terminal', 'New terminal'], 'term')).toHaveLength(2);
	});

	it('reports hit positions inside the haystack', () => {
		// C-o-m-p-i-l-e: 'cmp' lands on C, m, p
		expect(fuzzyScore('Compile', 'cmp')!.hits).toEqual([0, 2, 3]);
	});
});

describe('highlightRuns', () => {
	it('splits into matched and unmatched runs covering the whole string', () => {
		const runs = highlightRuns('Compile', [0, 2, 3]);
		expect(runs.map((r) => r.text).join('')).toBe('Compile');
		expect(runs.filter((r) => r.hit).map((r) => r.text)).toEqual(['C', 'mp']);
	});

	it('returns the whole string unmatched when nothing hit', () => {
		expect(highlightRuns('Compile', [])).toEqual([{ text: 'Compile', hit: false }]);
	});
});

describe('fuzzyScore on a name with a word start further on', () => {
	it('keeps a run going instead of jumping to the later word', () => {
		expect(fuzzyScore('math-and-figures.tex', 'math')?.hits).toEqual([0, 1, 2, 3]);
		expect(fuzzyScore('math-and-figures.tex', 'math-and')).not.toBeNull();
	});

	it('still matches when a jump would strand the letters after it', () => {
		expect(fuzzyScore('abc-b', 'abc')).not.toBeNull();
		expect(fuzzyScore('xa-ay', 'xay')).not.toBeNull();
	});
});
