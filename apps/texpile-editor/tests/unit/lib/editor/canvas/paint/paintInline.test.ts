import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { FrameDecorations, InlineDecorationView, Rgba } from '$lib/editor/canvas';
import type { PaintFrame } from '$lib/editor/canvas/contracts/engineTypes';
import { createCanvasPainter } from '$lib/editor/canvas/paint/painter';
import { canvasFill } from '$lib/editor/canvas/style/resolve/colorValue';
import { fixedViewStyles } from '../testing/fixedStyles';
import { monoMeasure } from '../testing/monoMeasure';
import { testMetrics } from '../layout/layoutFixture';
import { testModel } from '../geometry/geometryFixture';
import { recordingContext } from './recordingContext';

const TINT: Rgba = { r: 1, g: 0.8, b: 0, a: 0.25 };
const styles = fixedViewStyles();

function comment(from: number, to: number): InlineDecorationView {
	const canvasLook = { look: { backgroundColor: 'rgb(255 204 0 / 0.25)' } };
	return { from, to, classes: ['pm-range', 'pm-comment'], style: '', attrs: { 'data-comment': 't1' }, spec: { canvasLook } };
}

/** the tint's fills when the block was laid out under the same decorations it is painted with */
function tintFills(doc: PMNode, inline: InlineDecorationView[]): (readonly unknown[])[] {
	const decorations: FrameDecorations = { inline, nodes: new Map(), widgets: [] };
	const test = testModel(doc, { styles, frameDecorations: decorations });
	const painter = createCanvasPainter(test.model, () => {}, {
		measure: monoMeasure,
		ligatureBreak: 'zwnj',
		metrics: testMetrics,
		styles,
		geometry: test.geometry,
		ground: () => null
	});
	const state = EditorState.create({ doc });
	const frame: PaintFrame = {
		state,
		viewport: { x: 0, y: 0, width: 400, height: 300 },
		zoom: 1,
		dpr: 1,
		blocks: [],
		decorations,
		focus: 'editor',
		head: { pos: 1, affinity: 1 }
	};
	const { context, draws } = recordingContext();
	painter.paintBlock(context, { index: 0, pos: 0, top: 0, layout: test.layouts[0] }, frame);
	return draws.filter((draw) => draw.call === 'fillRect' && draw.fillStyle === canvasFill(TINT)).map((draw) => draw.args);
}

describe('inline decoration fills (9.3)', () => {
	// the text runs carried the tint too, so a paragraph laid out under a comment was shaded twice
	it('shades a comment once over the words it covers', () => {
		const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('alpha beta gamma'))]);
		const fills = tintFills(doc, [comment(7, 11)]);
		expect(fills).toHaveLength(1);
		expect(fills[0][2]).toBeCloseTo(monoMeasure('16px serif', 'beta'), 0);
	});

	// a formula inside a thread stood bare between its words
	it('carries the tint across an atom the comment crosses', () => {
		const formula = schema.nodes.inline_math.create({ latex: 'x' });
		const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [schema.text('ab '), formula, schema.text(' cd')])]);
		const spans = tintFills(doc, [comment(1, doc.content.size)])
			.map((args) => [args[0] as number, (args[0] as number) + (args[2] as number)])
			.sort((a, b) => a[0] - b[0]);
		for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeLessThanOrEqual(spans[i - 1][1] + 1);
	});
});
