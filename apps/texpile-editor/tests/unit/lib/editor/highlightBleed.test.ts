// Guard against subtree bleed: colours belong to marker/command tags, never to tags a grammar
// applies to whole regions of prose. md's OrderedList/BulletList/Blockquote rules span the entire
// subtree - item and quote TEXT included - so a colour on tags.list or tags.quote paints body
// text ("why is Five Six Seven not white"). These tests run the real markdown grammar against the
// real set of coloured tags from cmHighlight, so a future palette edit that reintroduces a
// subtree tag fails here.
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { ensureSyntaxTree } from '@codemirror/language';
import { highlightTree, tagHighlighter } from '@lezer/highlight';
import { markdown } from '@codemirror/lang-markdown';
import { coloredTags } from '$lib/editor/code/highlightStyle';

const DOC = `# Heading

5. Five
6. Six

- bullet item

> quoted text

para with "plain prose" here

[Inline link](https://commonmark.org)
`;

// one class per coloured tag; a span reaching the callback = a span the theme would colour
const coloured = tagHighlighter(coloredTags.map((tag, i) => ({ tag, class: `c${i}` })));

function colouredSpans(doc: string): string[] {
	const state = EditorState.create({ doc, extensions: [markdown()] });
	const tree = ensureSyntaxTree(state, doc.length, 5000);
	const out: string[] = [];
	if (tree) highlightTree(tree, coloured, (from, to) => out.push(doc.slice(from, to)));
	return out;
}

describe('highlight bleed guard (markdown)', () => {
	const spans = colouredSpans(DOC);

	it('list item text stays uncoloured', () => {
		for (const text of ['Five', 'Six', 'bullet item']) {
			expect(spans.filter((s) => s.includes(text))).toEqual([]);
		}
	});

	it('blockquote text and plain prose stay uncoloured', () => {
		for (const text of ['quoted text', 'plain prose', 'Heading']) {
			expect(spans.filter((s) => s.includes(text))).toEqual([]);
		}
	});

	it('the markers themselves are coloured', () => {
		for (const marker of ['5.', '6.', '-', '>', '#']) {
			expect(spans).toContain(marker);
		}
	});

	it('link TEXT stays uncoloured while the url is coloured', () => {
		expect(spans.filter((s) => s.includes('Inline link'))).toEqual([]);
		expect(spans).toContain('https://commonmark.org');
	});
});
