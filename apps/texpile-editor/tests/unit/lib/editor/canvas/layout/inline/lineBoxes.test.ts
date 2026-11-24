import { it, expect } from 'vitest';
import type { LayoutBoxBuilder, LineFragment, RunStyle } from '$lib/editor/canvas';
import { stackLines, usedLineHeight } from '$lib/editor/canvas/layout/inline/lineBoxes';
import type { PlacedLine } from '$lib/editor/canvas/layout/inline/inlineFragments';
import { defaultLayoutStyle, defaultPaintStyle, FIXED_FONT, fontStringOf } from '../../testing/fixedStyles';
import { testMetrics } from '../layoutFixture';

const STYLE = { ...defaultLayoutStyle(), lineHeight: 27 };

function run(overrides: Partial<RunStyle> = {}): RunStyle {
	return {
		id: 1,
		layoutKey: 1,
		paintKey: 1,
		font: FIXED_FONT,
		fontString: fontStringOf(FIXED_FONT),
		letterSpacing: 0,
		wordSpacing: 0,
		textTransform: 'none',
		verticalAlign: 'baseline',
		edges: { start: 0, end: 0 },
		paint: defaultPaintStyle(),
		lineHeight: 27,
		...overrides
	};
}

function text(style: RunStyle, value = 'word'): LineFragment {
	return { kind: 'text', x: 0, width: 40, text: value, run: style, from: 1, to: 1 + value.length, level: 0, advances: null };
}

function line(...fragments: LineFragment[]): PlacedLine {
	return { fragments, hyphen: null, from: 1, to: 5, forced: true };
}

const request = (pixelRatio = 1) => ({ style: STYLE, metrics: testMetrics, pixelRatio, spaceWidth: 5 });

it('uses a unitless line height against the font size Blink rounds to 1/64 px, as P0 recorded', () => {
	expect(usedLineHeight(27.991, 17.072, 17, 4)).toBe(28);
	expect(usedLineHeight(32.864, 23.9008, 23, 6)).toBe(2103 / 64);
	expect(usedLineHeight('normal', 16, 12, 4)).toBe(16);
});

it('floors the half leading above the text to device pixels and puts the rest below', () => {
	// ascent 12 and descent 4 in 27 px: 11 px of leading, 5 above at DPR 1, 5.5 at DPR 2
	const [one] = stackLines([line(text(run()))], request(1), 0).boxes;
	expect([one.height, one.baseline, one.textTop, one.textBottom]).toEqual([27, 17, 5, 21]);
	const [two] = stackLines([line(text(run()))], request(2), 0).boxes;
	expect(two.baseline).toBe(17.5);
});

it('keeps a sup with line-height 0 from growing its line and grows it for a taller atomic box', () => {
	const sup = run({ font: { ...FIXED_FONT, sizePx: 12 }, fontString: '12px serif', lineHeight: 0, shift: -6 });
	const [plain] = stackLines([line(text(run()), text(sup, '2'))], request(), 0).boxes;
	expect(plain.height).toBe(27);
	const box = { style: { layout: STYLE }, margin: { top: 0, right: 0, bottom: 0, left: 0 }, height: 40 } as unknown as LayoutBoxBuilder;
	const atomic: LineFragment = { kind: 'atomic', x: 0, width: 30, ascent: 40, descent: 0, box, from: 5, to: 6 };
	const [tall] = stackLines([line(text(run()), atomic)], request(), 10).boxes;
	// the box sits on the baseline: 40 above it, the strut's 10 below
	expect([tall.y, tall.baseline, tall.height]).toEqual([10, 50, 50]);
});
