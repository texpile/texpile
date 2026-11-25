import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Decoration, DecorationSet } from 'prosemirror-view';
import {
	copyDecoration,
	decorationAttrsOf,
	isInlineDecoration,
	isWidget,
	localDecorations,
	sameDecorationSource,
	sameDecorationType,
	widgetSide
} from '$lib/editor/canvas/decorations/decorationAttrs';
import { testSchema } from '../testing/testCanvasView';

const { paragraph } = testSchema.nodes;
const doc = testSchema.node('doc', null, [
	paragraph.create(null, testSchema.text('one two')),
	paragraph.create(null, testSchema.text('three'))
]);
const inline = Decoration.inline(2, 5, { class: 'tint', 'data-thread': 't1' });
const node = Decoration.node(9, 16, { class: 'block-mark' });
const widget = Decoration.widget(3, () => document.createElement('span'), { side: -1 });

describe('the reader of prosemirror-view internals', () => {
	it('is pinned to the version it reads', () => {
		const require = createRequire(import.meta.url);
		const entry = require.resolve('prosemirror-view');
		const manifest = JSON.parse(readFileSync(path.join(entry, '../../package.json'), 'utf8')) as { version: string };
		expect(manifest.version, 'read the internals again before moving the pin').toBe('1.42.9');
	});

	it('tells the kind of each decoration and the attrs it was made with', () => {
		expect([isInlineDecoration(inline), isWidget(inline)]).toEqual([true, false]);
		expect([isInlineDecoration(node), isWidget(node)]).toEqual([false, false]);
		expect([isInlineDecoration(widget), isWidget(widget)]).toEqual([false, true]);
		expect(decorationAttrsOf(inline)).toEqual({ class: 'tint', 'data-thread': 't1' });
		expect(decorationAttrsOf(node)).toEqual({ class: 'block-mark' });
		expect(decorationAttrsOf(widget)).toEqual({});
		expect(widgetSide(widget)).toBe(-1);
	});

	it('copies a decoration over a new range and compares types', () => {
		const copy = copyDecoration(inline, 3, 4);
		expect([copy.from, copy.to]).toEqual([3, 4]);
		expect(sameDecorationType(copy, inline)).toBe(true);
		expect(sameDecorationType(inline, Decoration.inline(2, 5, { class: 'other' }))).toBe(false);
	});

	it('reads the decorations a set holds on a node and compares sets', () => {
		const set = DecorationSet.create(doc, [inline, node, widget]);
		expect(localDecorations(set, doc).map((d) => d.from)).toEqual([9]);
		const first = set.forChild(0, doc.child(0));
		// an inline decoration comes back split around a widget inside it
		expect(localDecorations(first, doc.child(0)).map((d) => [d.from, d.to])).toEqual([
			[1, 2],
			[2, 2],
			[2, 4]
		]);
		expect(sameDecorationSource(set, DecorationSet.create(doc, [inline, node, widget])), 'sets compare by what they hold').toBe(true);
		expect(sameDecorationSource(set, DecorationSet.create(doc, [inline, node]))).toBe(false);
	});
});
