// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { Rgba } from '$lib/editor/canvas';
import type { PaintFrame } from '$lib/editor/canvas/contracts/engineTypes';
import { createCanvasPainter, type PaintStyleSource } from '$lib/editor/canvas/paint/painter';
import { canvasFill } from '$lib/editor/canvas/style/resolve/colorValue';
import { fixedViewStyles, type FixedTheme } from '../testing/fixedStyles';
import { monoMeasure } from '../testing/monoMeasure';
import { testMetrics } from '../layout/layoutFixture';
import { testModel, type TestModel } from '../geometry/geometryFixture';
import { recordingContext } from './recordingContext';

const paragraph = schema.nodes.paragraph.create(null, schema.text('alpha beta gamma'));
const doc = schema.nodes.doc.create(null, [paragraph]);
const WHITE: Rgba = { r: 1, g: 1, b: 1, a: 1 };

function frameOf(state: EditorState, test: TestModel, focus: PaintFrame['focus'] = 'editor'): PaintFrame {
	return {
		state,
		viewport: { x: -40, y: 0, width: 400, height: 300 },
		zoom: 1,
		dpr: 1,
		blocks: [],
		decorations: { inline: [], nodes: new Map(), widgets: [] },
		focus,
		head: { pos: state.selection.head, affinity: 1 }
	};
}

function painterOf(test: TestModel, styles: PaintStyleSource, ground: () => Rgba | null = () => WHITE) {
	return createCanvasPainter(test.model, () => {}, {
		measure: monoMeasure,
		ligatureBreak: 'zwnj',
		metrics: testMetrics,
		styles,
		geometry: test.geometry,
		ground
	});
}

function textColors(test: TestModel, styles: PaintStyleSource, state: EditorState): string[] {
	const { context, draws } = recordingContext();
	painterOf(test, styles).paintBlock(context, { index: 0, pos: 0, top: 0, layout: test.layouts[0] }, frameOf(state, test));
	return draws.filter((draw) => draw.call === 'fillText').map((draw) => draw.fillStyle);
}

/** a theme whose switch to dark changes --color-surface-950-50 and, when asked, --spacing */
function theme(darkSpacing?: string): { theme: FixedTheme; toDark(): void } {
	const fixed: FixedTheme = { tokens: { '--color-surface-950-50': 'rgb(10, 10, 10)' }, epoch: 0, paintEpoch: 0 };
	return {
		theme: fixed,
		toDark() {
			fixed.tokens = { '--color-surface-950-50': 'rgb(240, 240, 240)', ...(darkSpacing ? { '--spacing': darkSpacing } : {}) };
			fixed.paintEpoch++;
		}
	};
}

describe('painter (6)', () => {
	it('repaints a dark mode switch in the new colors and keeps the layout epoch, so nothing is laid out again', () => {
		const { theme: fixed, toDark } = theme();
		const styles = fixedViewStyles([{ selector: 'p', look: { color: 'var(--color-surface-950-50)' } }], fixed);
		const test = testModel(doc, { styles });
		const state = EditorState.create({ doc });
		const painter = painterOf(test, styles);
		const draw = (): string[] => {
			const { context, draws } = recordingContext();
			painter.paintBlock(context, { index: 0, pos: 0, top: 0, layout: test.layouts[0] }, frameOf(state, test));
			return [...new Set(draws.filter((d) => d.call === 'fillText').map((d) => d.fillStyle))];
		};
		expect(draw()).toEqual([canvasFill({ r: 10 / 255, g: 10 / 255, b: 10 / 255, a: 1 })]);
		toDark();
		expect(draw()).toEqual([canvasFill({ r: 240 / 255, g: 240 / 255, b: 240 / 255, a: 1 })]);
		expect([styles.epoch, styles.paintEpoch]).toEqual([0, 1]);
	});

	it('starts a new layout epoch when the switched theme changes a layout value', () => {
		const { theme: fixed, toDark } = theme('5px');
		const styles = fixedViewStyles([{ selector: 'p', look: { marginBottom: 'calc(var(--spacing) * 3)' } }], fixed);
		const test = testModel(doc, { styles });
		toDark();
		textColors(test, styles, EditorState.create({ doc }));
		expect(styles.epoch).toBe(1);
	});

	it('fills a range selection over the line box before the text it covers, in --editor-selection', () => {
		const selection: Rgba = { r: 0, g: 0, b: 1, a: 0.3 };
		const styles = fixedViewStyles([], { tokens: { '--editor-selection': 'rgb(0 0 255 / 0.3)' }, epoch: 0, paintEpoch: 0 });
		const test = testModel(doc, { styles });
		const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1, 6) });
		const { context, draws } = recordingContext();
		painterOf(test, styles).paintBlock(context, { index: 0, pos: 0, top: 0, layout: test.layouts[0] }, frameOf(state, test));
		const shade = draws.findIndex((d) => d.call === 'fillRect' && d.fillStyle === canvasFill(selection));
		const text = draws.findIndex((d) => d.call === 'fillText');
		expect(shade).toBeGreaterThanOrEqual(0);
		expect(shade).toBeLessThan(text);
		const line = test.geometry.linesOf(0)[0];
		expect(draws[shade].args).toEqual([0, line.top, 48, line.bottom - line.top]);
	});

	it('paints an opaque ground on the resolved background, and none when it is translucent (D17)', () => {
		const styles = fixedViewStyles();
		const test = testModel(doc, { styles });
		const frame = frameOf(EditorState.create({ doc }), test);
		const opaque = painterOf(test, styles);
		const glass = painterOf(test, styles, () => null);
		const solid = recordingContext();
		opaque.ground(solid.context, frame);
		const clear = recordingContext();
		glass.ground(clear.context, frame);
		expect([opaque.opaque, solid.draws[0].call, solid.draws[0].fillStyle, solid.draws[0].args]).toEqual([
			true,
			'fillRect',
			canvasFill(WHITE),
			[-40, 0, 400, 300]
		]);
		expect([glass.opaque, clear.draws[0].call]).toEqual([false, 'clearRect']);
	});
});
