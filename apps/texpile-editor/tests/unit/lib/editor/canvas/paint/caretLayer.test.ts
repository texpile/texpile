import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection, type Selection } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { PaintFrame } from '$lib/editor/canvas/contracts/engineTypes';
import { createCanvasPainter, type PaintStyleSource } from '$lib/editor/canvas/paint/painter';
import type { BlinkClock } from '$lib/editor/canvas/paint/blink';
import { gapEdgeOf } from '$lib/editor/canvas/paint/caretLayer';
import { fixedStyles, fixedViewStyles } from '../testing/fixedStyles';
import { monoMeasure } from '../testing/monoMeasure';
import { testMetrics } from '../layout/layoutFixture';
import { testModel } from '../geometry/geometryFixture';
import { recordingContext } from './recordingContext';

const { paragraph } = schema.nodes;
const doc = schema.nodes.doc.create(null, [
	paragraph.create(null, schema.text('alpha beta')),
	paragraph.create(null, schema.text('gamma'))
]);
const second = doc.firstChild!.nodeSize;
const rules = [{ selector: 'p', look: { margin: '0px 0px 10px' } }];
const styles: PaintStyleSource = fixedViewStyles(rules);
const test = testModel(doc, { styles: fixedStyles(rules) });

function setup() {
	let now = 0;
	const timers: { at: number; run: () => void }[] = [];
	const clock: BlinkClock = {
		now: () => now,
		setTimeout: (run, ms) => timers.push({ at: now + ms, run }),
		clearTimeout: (id) => timers.splice(id - 1, 1, { at: Infinity, run: () => {} })
	};
	const painter = createCanvasPainter(test.model, () => {}, {
		measure: monoMeasure,
		ligatureBreak: 'zwnj',
		metrics: testMetrics,
		styles,
		geometry: test.geometry,
		ground: () => null,
		clock
	});
	function paint(
		selection: Selection,
		focus: PaintFrame['focus'] = 'editor',
		stored: EditorState['storedMarks'] = null,
		placed: PaintFrame['blocks'] | null = null
	) {
		const state = EditorState.create({ doc, selection, storedMarks: stored });
		const context = recordingContext().context;
		painter.paintCarets(
			{
				state,
				viewport: { x: 0, y: 0, width: 300, height: 200 },
				zoom: 1,
				dpr: 1,
				blocks:
					placed ??
					Array.from({ length: test.model.count }, (_, index) => ({
						index,
						pos: test.model.block(index).pos,
						top: test.model.top(index).y,
						layout: test.model.layout(index)
					})),
				decorations: { inline: [], nodes: new Map(), widgets: [] },
				focus,
				head: { pos: selection.head, affinity: 1 }
			},
			() => context
		);
		return painter.carets();
	}
	return { paint, advance: (ms: number) => (now += ms) };
}

describe('caret layer (6.4)', () => {
	it('draws nothing for a caret in a block the frame did not place', () => {
		const { paint } = setup();
		expect(paint(TextSelection.create(doc, second + 2), 'editor', null, [])).toEqual([]);
	});

	it('draws one local caret, 1 px wide over the font box at the place, blinking from visible on every move', () => {
		const { paint, advance } = setup();
		const at = TextSelection.create(doc, 3);
		const [caret, ...more] = paint(at);
		const place = test.geometry.caretRect({ pos: 3, affinity: 1 })!;
		expect(more).toEqual([]);
		expect([caret.kind, caret.rect, caret.visible]).toEqual(['local', { ...place, width: 1 }, true]);
		advance(600);
		expect(paint(at)[0].visible).toBe(false);
		expect(paint(TextSelection.create(doc, 4))[0].visible).toBe(true);
	});

	it('draws the blur caret 1.1 em tall on the strut while focus sits in an overlay, raised by a pending sup', () => {
		const { paint } = setup();
		const at = TextSelection.create(doc, 3);
		const line = test.geometry.lineOf({ pos: 3, affinity: 1 })!;
		const [blur] = paint(at, 'overlay');
		expect([blur.kind, blur.rect.height, blur.rect.y + blur.rect.height / 2]).toEqual(['blur', 17.6, (line.textTop + line.textBottom) / 2]);
		const [raised] = paint(at, 'overlay', [schema.marks.sup.create()]);
		expect(raised.rect.y).toBeCloseTo(blur.rect.y - 8);
	});

	it('draws the gap cursor 20 px wide 2 px above the block it sits before, and nothing with focus away', () => {
		const { paint } = setup();
		const gap = new GapCursor(doc.resolve(second));
		const next = test.geometry.nodeRect(second)!.rect;
		const [bar] = paint(gap);
		expect([bar.kind, bar.rect]).toEqual(['gap', { x: next.x, y: next.y - 2, width: 20, height: 1 }]);
		expect(paint(gap, 'overlay')).toEqual([]);
		expect(paint(TextSelection.create(doc, 3), 'away')).toEqual([]);
	});
});

// prosemirror-gapcursor's widget stood in the parent's flow, left of a code card's margin
it('stands a gap cursor at the margin edge of the block after it', () => {
	const doc = schema.nodes.doc.create(null, [
		schema.nodes.paragraph.create(null, schema.text('a')),
		schema.nodes.code_block.create(null, schema.text('x'))
	]);
	const gap = new GapCursor(doc.resolve(3));
	const geometry = { nodeRect: () => ({ rect: { x: 12, y: 40, width: 100, height: 20 }, estimated: false, marginLeft: 4 }) };
	expect(gapEdgeOf(gap, geometry)).toEqual({ x: 8, y: 40 });
});
