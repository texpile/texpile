import { describe, it, expect } from 'vitest';
import type { Node } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { compileFind, type FindQuery } from '$lib/editor/visual/find/findQuery';
import { findMatches, type ShownText } from '$lib/editor/visual/find/findMatches';

const N = schema.nodes;
const query = (search: string, extra: Partial<FindQuery> = {}): FindQuery => ({
	search,
	replace: '',
	caseSensitive: false,
	wholeWord: false,
	regexp: false,
	...extra
});

/** "As Table <ref tab:corpus> shows, the corpus <\term{key word}> is $\psi$ small." with the chips drawn as below */
function doc(): Node {
	return N.doc.create(null, [
		N.paragraph.create(null, [
			schema.text('As Table '),
			N.ref.create(null, schema.text('tab:corpus')),
			schema.text(' shows, the '),
			schema.text('corpus', [schema.marks.strong.create()]),
			schema.text(' '),
			N.inline_latex.create(null, schema.text('\\term{key word}')),
			schema.text(' is '),
			N.inline_math.create(null, schema.text('\\psi')),
			schema.text(' small.')
		])
	]);
}

// what the page draws: the ref as its number, the macro as its words, the formula in a shadow tree
const drawn: ShownText = (node) => (node.type.name === 'ref' ? '1' : node.type.name === 'inline_latex' ? 'key word' : null);

function found(search: string, extra: Partial<FindQuery> = {}) {
	const d = doc();
	return findMatches(d, compileFind(query(search, extra))!, drawn).map((m) =>
		m.kind === 'text' ? d.textBetween(m.from, m.to) : `[${m.node.type.name}]`
	);
}

describe('search in the visual editor', () => {
	it('matches what the page shows, never the source behind a chip', () => {
		// the ref's key and the macro's command are not on the page
		expect(found('corpus')).toEqual(['corpus']);
		expect(found('term')).toEqual([]);
		expect(found('key word')).toEqual(['[inline_latex]']);
		expect(found('1')).toEqual(['[ref]']);
	});

	it('reads a formula by its LaTeX, which is the only text it has', () => {
		expect(found('psi')).toEqual(['[inline_math]']);
	});

	it('finds a word across a change of style as one match', () => {
		expect(found('the corpus')).toEqual(['the corpus']);
	});

	it('skips a regex match of nothing and keeps whole words whole', () => {
		expect(found('corpus|', { regexp: true })).toEqual(['corpus']);
		expect(found('corp', { wholeWord: true })).toEqual([]);
	});
});
