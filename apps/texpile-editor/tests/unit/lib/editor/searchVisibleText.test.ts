// A prose search must not reach the key inside a \ref/\cite chip: the editor draws those as a
// number or an author-year, so rewriting the key breaks the document invisibly.
import { describe, it, expect, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { SearchQuery, search, setSearchState } from 'prosemirror-search';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { visibleMatches, replaceAllVisible, VisibleTextQuery } from '$lib/editor/visual/searchVisibleText';

const N = schema.nodes;

/** "As Table <ref:tab:corpus> shows, the corpus is small." */
function docWithRef() {
	return N.doc.create(null, [
		N.paragraph.create(null, [
			schema.text('As Table '),
			N.ref.create(null, schema.text('tab:corpus')),
			schema.text(' shows, the corpus is small.')
		])
	]);
}

function stateFor(query: SearchQuery) {
	const base = EditorState.create({ doc: docWithRef(), plugins: [search()] });
	return base.apply(setSearchState(base.tr, query));
}

describe('search over visible text', () => {
	it('does not match the label inside a ref chip', () => {
		const state = stateFor(new SearchQuery({ search: 'corpus' }));
		// the prose says "corpus" once; the chip's tab:corpus is not a match
		expect(visibleMatches(state, new SearchQuery({ search: 'corpus' })).length).toBe(1);
	});

	it('replace all leaves the cross-reference intact', () => {
		const state = stateFor(new SearchQuery({ search: 'corpus', replace: 'collection' }));
		let next = state;
		replaceAllVisible(state, (tr) => (next = state.apply(tr)));
		expect(next.doc.textContent).toContain('tab:corpus');
		expect(next.doc.textContent).toContain('the collection is small');
	});

	it('steps past a regex match of nothing instead of standing on it', () => {
		// a scan standing still calls findNext forever; cut it short so the test fails instead of hanging
		const real = SearchQuery.prototype.findNext;
		let calls = 0;
		const spy = vi.spyOn(SearchQuery.prototype, 'findNext').mockImplementation(function (this: SearchQuery, ...args) {
			if (++calls > 10_000) throw new Error('the scan stood still');
			return real.apply(this, args);
		});
		try {
			const query = new VisibleTextQuery({ search: 'corpus|', regexp: true });
			const state = stateFor(query);
			expect(visibleMatches(state, query).map((m) => state.doc.textBetween(m.from, m.to))).toEqual(['corpus']);
		} finally {
			spy.mockRestore();
		}
	});
});
