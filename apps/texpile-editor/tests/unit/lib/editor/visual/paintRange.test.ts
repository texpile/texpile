import { describe, it, expect } from 'vitest';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { paintRange } from '$lib/editor/visual/highlight/paintRange';
import type { Node as PMNode } from 'prosemirror-model';

const math = (latex: string) => schema.nodes.inline_math.create({ latex });
const para = (...content: PMNode[]) => schema.nodes.paragraph.create(null, content);
const doc = (...children: PMNode[]) => schema.nodes.doc.create(null, children);

// words, a formula, more words: the shape every one of these bugs was found in
const passage = doc(para(schema.text('before '), math('x^2'), schema.text(' after')));

const classesOf = (d: PMNode, r: Parameters<typeof paintRange>[1]) =>
	paintRange(d, r).map((deco) => (deco as unknown as { type: { attrs?: Record<string, string> } }).type.attrs?.class ?? '');

describe('paintRange', () => {
	it('draws the formula the browser skips and leaves the text it paints alone', () => {
		const painted = classesOf(passage, { from: 1, to: passage.content.size, tint: 'red', key: 'k', reach: 'line', nativeText: true });
		expect(painted).toEqual(['pm-range pm-range-node']);
	});

	it('draws the words too when the browser is painting nothing, at the line box', () => {
		const painted = classesOf(passage, { from: 1, to: passage.content.size, tint: 'red', key: 'k', reach: 'line' });
		expect(painted).toEqual(['pm-range pm-range-text', 'pm-range pm-range-node']);
	});

	it('hugs the words when the range is a thread rather than a selection', () => {
		const painted = classesOf(passage, { from: 1, to: passage.content.size, tint: 'red', key: 'k', reach: 'text', class: 'pm-comment' });
		expect(painted).toEqual(['pm-range pm-comment', 'pm-range pm-range-node pm-comment']);
		// only a shade meant to reach the line box is worth measuring a line for
		expect(paintRange(passage, { from: 1, to: passage.content.size, tint: 'red', key: 'k', reach: 'text' })).toEqual(
			expect.not.arrayContaining([
				expect.objectContaining({ type: expect.objectContaining({ attrs: expect.objectContaining({ 'data-band': expect.anything() }) }) })
			])
		);
	});

	it('leaves a code block that draws the thread in its own characters unshaded as a whole', () => {
		const withCode = doc(para(schema.text('see below')), schema.nodes.code_block.create(null, schema.text('x = 1')));
		const thread = { from: 1, to: withCode.content.size, tint: 'red', key: 'k', reach: 'text' as const };
		expect(classesOf(withCode, { ...thread, mirrored: true })).toEqual(['pm-range']);
		// a selection has no such mirror, so the block it crosses is shaded whole
		expect(classesOf(withCode, thread)).toEqual(['pm-range', 'pm-range pm-range-node']);
	});

	it('shades a code block a selection covers from its edges, and not one being edited inside', () => {
		const withCode = doc(para(schema.text('see below')), schema.nodes.code_block.create(null, schema.text('x = 1')));
		const start = withCode.content.size - withCode.lastChild!.nodeSize;
		const range = { tint: 'red', key: 'k', reach: 'line' as const, nativeText: true };
		expect(classesOf(withCode, { ...range, from: start, to: withCode.content.size })).toEqual(['pm-range pm-range-node']);
		expect(classesOf(withCode, { ...range, from: start + 1, to: withCode.content.size - 1 })).toEqual([]);
	});
});
