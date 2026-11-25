import { it, expect } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { mdSchema } from '$lib/languages/markdown/visual/schema';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { breakProfileOf, type BreakSettings } from '$lib/editor/canvas/layout/inline/breakProfiles';
import type { LayoutStyle } from '$lib/editor/canvas';
import { defaultLayoutStyle } from '../../testing/fixedStyles';
import { layoutTestBlock, lineTexts } from '../layoutFixture';

const ON: BreakSettings = { justify: true, hyphenate: true };
// past the DOM editor's large-document size it broke lines plainly; the canvas keeps Knuth-Plass (21.1)
const LARGE_DOC_NODE_SIZE = 150_000;
const START = defaultLayoutStyle();

function profile(node: PMNode, settings = ON, style: LayoutStyle = START): string {
	const { breaker, justified, hyphenate } = breakProfileOf(node, style, settings);
	return `${breaker}${justified ? ' justified' : ''}${hyphenate ? ' hyphenated' : ''}`;
}

it('holds paragraphs justified with hyphens in every language and headings ragged', () => {
	const words = schema.text('words');
	expect(profile(schema.nodes.paragraph.create(null, words))).toBe('knuthPlass justified hyphenated');
	expect(profile(mdSchema.nodes.paragraph.create(null, mdSchema.text('words')))).toBe('knuthPlass justified hyphenated');
	expect(profile(typSchema.nodes.paragraph.create(null, typSchema.text('words')))).toBe('knuthPlass justified hyphenated');
	expect(profile(schema.nodes.heading.create({ level: 1 }, words))).toBe('knuthPlass');
	expect(profile(mdSchema.nodes.heading.create({ level: 2 }, mdSchema.text('words')))).toBe('knuthPlass');
});

it('sets a paragraph ragged with Justify off or an alignment other than the start', () => {
	const paragraph = schema.nodes.paragraph.create(null, schema.text('words'));
	expect(profile(paragraph, { justify: false, hyphenate: true })).toBe('knuthPlass');
	expect(profile(paragraph, ON, { ...START, textAlign: 'center' })).toBe('knuthPlass');
	expect(profile(paragraph, ON, { ...START, textAlign: 'right' })).toBe('knuthPlass');
	expect(profile(paragraph, { justify: true, hyphenate: false })).toBe('knuthPlass justified');
});

it('wraps captions, notes and titles greedily, justified only where their CSS says so', () => {
	const caption = schema.nodes.float_caption.create(null, schema.text('A caption'));
	expect(profile(caption)).toBe('greedy');
	expect(profile(caption, ON, { ...START, textAlign: 'justify' })).toBe('greedy justified');
	expect(profile(schema.nodes.table_caption.create(null, schema.text('Results')))).toBe('greedy');
	expect(profile(schema.nodes.table_notes.create(null, schema.text('Notes')))).toBe('greedy');
	expect(profile(schema.nodes.frame_title.create(null, schema.text('Title')))).toBe('greedy');
	expect(profile(typSchema.nodes.term_title.create(null, typSchema.text('Term')))).toBe('greedy');
});

it('wraps a held paragraph holding a tab greedily, still justified', () => {
	expect(profile(schema.nodes.paragraph.create(null, schema.text('a\tb')))).toBe('greedy justified');
	expect(profile(schema.nodes.heading.create({ level: 1 }, schema.text('a\tb')))).toBe('greedy');
});

it('breaks a paragraph of a document over LARGE_DOC_NODE_SIZE with Knuth-Plass', () => {
	const text = 'aaa bbb ccc dddddd eeeeeeeee fff gg hhhhh iiii jjjjjjj kk llll mmmmm';
	const paragraphs = Array.from({ length: Math.ceil(LARGE_DOC_NODE_SIZE / text.length) + 1 }, () =>
		schema.nodes.paragraph.create(null, schema.text(text))
	);
	const doc = schema.nodes.doc.create(null, paragraphs);
	expect(doc.nodeSize).toBeGreaterThan(LARGE_DOC_NODE_SIZE);
	const paragraph = doc.child(paragraphs.length - 1);
	expect(profile(paragraph)).toBe('knuthPlass justified hyphenated');
	// first fit would take 'aaa bbb ccc' on the first line and leave the second half empty
	const layout = layoutTestBlock(paragraph, { width: 150 });
	expect(lineTexts(layout)).toEqual(['aaa bbb ', 'ccc dddddd ', 'eeeeeeeee fff ', 'gg hhhhh iiii ', 'jjjjjjj kk llll ', 'mmmmm']);
	expect(layout.box.lines!.map((line) => line.justified)).toEqual([true, true, true, true, true, false]);
});
