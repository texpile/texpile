import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { textMirrorOf } from '$lib/editor/canvas/interaction/input/textMirror';

const { paragraph, inline_math: inlineMath, hard_break: hardBreak } = schema.nodes;
// "ab", a formula of five positions, "cd", a hard break, "ef"
const doc = schema.nodes.doc.create(null, [
	paragraph.create(null, schema.text('first')),
	paragraph.create(null, [
		schema.text('ab'),
		inlineMath.create(null, schema.text('x^2')),
		schema.text('cd'),
		hardBreak.create(),
		schema.text('ef')
	])
]);
const start = 'first'.length + 3;

describe('textMirrorOf', () => {
	it('holds the caret block with an inline node as U+FFFC and a hard break as a newline, mapping both ways', () => {
		const mirror = textMirrorOf(EditorState.create({ doc, selection: TextSelection.create(doc, start + 8) }));
		expect(mirror.text).toBe('ab￼cd\nef');
		expect(mirror.start).toBe(start);
		expect(mirror.selection).toEqual({ start: 4, end: 4 });
		expect([mirror.toDoc(2), mirror.toDoc(3), mirror.toDoc(5), mirror.toDoc(8)]).toEqual([start + 2, start + 7, start + 9, start + 12]);
		expect([mirror.fromDoc(start + 2), mirror.fromDoc(start + 7)]).toEqual([2, 3]);
	});

	it('a selected inline node is its one character', () => {
		const mirror = textMirrorOf(EditorState.create({ doc, selection: NodeSelection.create(doc, start + 2) }));
		expect(mirror.selection).toEqual({ start: 2, end: 3 });
		expect([mirror.toDoc(2), mirror.toDoc(3)]).toEqual([start + 2, start + 7]);
	});

	it('windows a long paragraph around the caret', () => {
		const long = schema.nodes.doc.create(null, [paragraph.create(null, schema.text('x'.repeat(100)))]);
		const mirror = textMirrorOf(EditorState.create({ doc: long, selection: TextSelection.create(long, 61) }), 20);
		expect([mirror.text.length, mirror.start, mirror.selection.start]).toEqual([20, 51, 10]);
		expect(mirror.toDoc(20)).toBe(71);
	});
});
