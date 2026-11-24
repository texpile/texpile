import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { WidgetDecorationView } from '$lib/editor/canvas';
import type { PaintFrame } from '$lib/editor/canvas/contracts/engineTypes';
import { createCanvasPainter, type PaintStyleSource } from '$lib/editor/canvas/paint/painter';
import type { BlinkClock } from '$lib/editor/canvas/paint/blink';
import { fixedStyles, fixedViewStyles } from '../testing/fixedStyles';
import { monoMeasure } from '../testing/monoMeasure';
import { testMetrics } from '../layout/layoutFixture';
import { testModel } from '../geometry/geometryFixture';
import { recordingContext } from '../paint/recordingContext';

// the looks are caretLooks.ts's; the fixed tokens give --spacing 4px, so the bar is 2px
const fixed = fixedStyles();
const styles: PaintStyleSource = { ...fixedViewStyles(), styleOf: (el, pseudo) => fixed.styleOf(el, pseudo) };
const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('alpha beta gamma'))]);
const test = testModel(doc, { styles: fixed });

function peerAt(pos: number): WidgetDecorationView {
	const spec = { key: 'caret:7', canvas: { kind: 'caret' as const, peer: { name: 'Ada', color: '#7c3aed', arrival: 1 } } };
	return { pos, side: 0, key: spec.key, spec, marks: null, ignoreSelection: true };
}

function setup() {
	let now = 0;
	const clock: BlinkClock = { now: () => now, setTimeout: () => 0, clearTimeout: () => {} };
	const painter = createCanvasPainter(test.model, () => {}, {
		measure: monoMeasure,
		ligatureBreak: 'zwnj',
		metrics: testMetrics,
		styles,
		geometry: test.geometry,
		ground: () => null,
		clock
	});
	function paint(focus: PaintFrame['focus']) {
		const state = EditorState.create({ doc });
		const recording = recordingContext();
		let bounds: unknown = null;
		painter.paintCarets(
			{
				state,
				viewport: { x: 0, y: 0, width: 300, height: 200 },
				zoom: 1,
				dpr: 1,
				blocks: [{ index: 0, pos: 0, top: 0, layout: test.layouts[0] }],
				decorations: { inline: [], nodes: new Map(), widgets: [peerAt(7)] },
				focus,
				head: { pos: 1, affinity: 1 }
			},
			(covered) => ((bounds = covered), recording.context)
		);
		const names = recording.draws.filter((draw) => draw.call === 'fillText').map((draw) => draw.args[0]);
		return { carets: painter.carets(), bounds, names };
	}
	return { paint, advance: (ms: number) => (now += ms) };
}

describe('peer carets (6.4)', () => {
	it('draws a peer at its widget with the name above, whatever the focus', () => {
		const { paint } = setup();
		const { carets, bounds, names } = paint('away');
		const caret = test.geometry.caretRect({ pos: 7, affinity: 1 })!;
		expect(carets).toEqual([
			expect.objectContaining({ kind: 'remote', label: 'Ada', rect: expect.objectContaining({ x: caret.x - 1, width: 2 }) })
		]);
		expect(names).toEqual(['Ada']);
		// the label sits 1.35 of its own em (0.7 of the text's 16px) above the line
		expect((bounds as { y: number }).y).toBeCloseTo(carets[0].rect.y - 1.35 * 16 * 0.7, 3);
	});

	it('lets the name fade after its linger and keeps the bar', () => {
		const { paint, advance } = setup();
		paint('editor');
		advance(3200);
		const after = paint('editor');
		expect(after.names).toEqual([]);
		expect(after.carets.map((caret) => caret.kind)).toEqual(['local', 'remote']);
	});
});
