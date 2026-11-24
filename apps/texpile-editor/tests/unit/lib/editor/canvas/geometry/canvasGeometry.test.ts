import { describe, expect, it } from 'vitest';
import { TextSelection, EditorState } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { createCanvasGeometry } from '$lib/editor/canvas/geometry/canvasGeometry';
import { testMetrics } from '../layout/layoutFixture';
import { monoMeasure } from '../testing/monoMeasure';
import { testModel } from './geometryFixture';

const { paragraph, horizontal_rule: rule, hard_break: hardBreak } = schema.nodes;
const wrapped = paragraph.create(null, schema.text('alpha beta gamma delta epsilon zeta eta theta'));
const broken = paragraph.create(null, [schema.text('one'), hardBreak.create(), schema.text('two')]);
const doc = schema.nodes.doc.create(null, [wrapped, rule.create(), broken]);
const brokenPos = wrapped.nodeSize + 1;
const { geometry, view } = testModel(doc);

describe('canvas geometry (7.2)', () => {
	it('draws a soft break boundary on the earlier line with affinity -1 and the later with 1', () => {
		const [first, second] = geometry.linesOf(0);
		expect(first.to).toBe(second.from);
		const end = geometry.caretRect({ pos: first.to, affinity: -1 })!;
		const start = geometry.caretRect({ pos: first.to, affinity: 1 })!;
		expect([end.y, end.x]).toEqual([first.textTop, first.right]);
		expect([start.y, start.x]).toEqual([second.textTop, 0]);
		expect(geometry.lineOf({ pos: first.to, affinity: -1 })!.ref.index).toBe(0);
	});

	it('ends a line before the hard break that ends it', () => {
		const [one, two] = geometry.linesOf(brokenPos);
		expect([one.from, one.to, two.from]).toEqual([brokenPos + 1, brokenPos + 4, brokenPos + 5]);
	});

	it('moves to the adjacent line across blocks, skipping a drawn block, and keeps the goal x', () => {
		const next = geometry.adjacentLine({ textblock: 0, index: 1 }, 1)!;
		expect(next).toEqual({ textblock: brokenPos, index: 0 });
		expect(geometry.adjacentLine(next, -1)).toEqual({ textblock: 0, index: 1 });
		expect(geometry.placeOnLine({ textblock: 0, index: 0 }, 1000)).toEqual({ pos: geometry.linesOf(0)[0].to, affinity: -1 });
		expect(geometry.placeOnLine({ textblock: 0, index: 1 }, 1000).affinity).toBe(1);
	});

	it('finds the lines of a raw block whose hole sits in its code wrapper', () => {
		const raw = schema.nodes.raw_latex.create(null, schema.text('\\date{\\today}'));
		const rawDoc = schema.nodes.doc.create(null, [wrapped, raw]);
		const rawPos = wrapped.nodeSize;
		const { geometry: rawGeometry } = testModel(rawDoc);
		const [line] = rawGeometry.linesOf(rawPos);
		expect([line.from, line.to]).toEqual([rawPos + 1, rawPos + raw.nodeSize - 1]);
		expect(rawGeometry.caretRect({ pos: rawPos + 3, affinity: 1 })).not.toBeNull();
		expect(rawGeometry.adjacentLine({ textblock: 0, index: 1 }, 1)).toEqual({ textblock: rawPos, index: 0 });
	});

	it('answers rangeTop from the layout a block last had while an input it read changed (the comment rail)', () => {
		const { model } = testModel(doc);
		const stale = createCanvasGeometry({ ...model, cached: () => null }, { measure: monoMeasure, metrics: testMetrics });
		const [, second] = geometry.linesOf(0);
		expect(stale.rangeTop(second.from + 1)).toEqual({ y: geometry.rangeTop(second.from + 1).y, estimated: false });
		expect(stale.rangeTop(second.from + 1).y).toBeGreaterThan(stale.rangeTop(1).y);
	});

	it('answers endOfTextblock by lines up and down and by the textblock edges sideways', () => {
		const at = (pos: number) => EditorState.create({ doc, selection: TextSelection.create(doc, pos) });
		const [first, second] = geometry.linesOf(0);
		expect([geometry.endOfTextblock('up', at(3)), geometry.endOfTextblock('down', at(3))]).toEqual([true, false]);
		expect([geometry.endOfTextblock('up', at(second.from + 2)), geometry.endOfTextblock('down', at(second.from + 2))]).toEqual([
			false,
			true
		]);
		expect([geometry.endOfTextblock('left', at(1)), geometry.endOfTextblock('right', at(first.from + 2))]).toEqual([true, false]);
		expect(view.state.doc).toBe(doc);
	});
});
