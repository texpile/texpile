// a scrolled frame paints every glyph run of every formula on screen, and each font change costs the context a parse
import { expect, it } from 'vitest';
import type { MathLayout } from 'mathlive';
import { paintMathLayout } from '$lib/editor/canvas/math/mathPaint';
import { recordingContext } from '../paint/recordingContext';

const glyphs = (text: string, font: string, color: 'current' | { css: string } = 'current') =>
	({ kind: 'glyphs', x: 0, y: 0, text, font, color, opacity: 1 }) as const;

it('draws a formula’s runs of one color font by font, and a run of another color in its place', () => {
	const italic = 'italic 400 1em KaTeX_Math';
	const upright = '400 1em KaTeX_Main';
	const layout = {
		width: 1,
		ascent: 1,
		descent: 0,
		items: [glyphs('x', italic), glyphs('2', upright), glyphs('y', italic), glyphs('+', upright), glyphs('z', italic, { css: 'red' })],
		atoms: new Map(),
		selection: [],
		macroCalls: [],
		rows: []
	} as unknown as MathLayout;
	const { context, draws } = recordingContext();
	paintMathLayout(context, layout, 0, 0, { size: 10, color: 'black', family: 'serif', role: () => 'blue' });
	expect(draws.map((draw) => `${draw.args[0]} ${draw.font}`)).toEqual([
		'2 400 10px KaTeX_Main',
		'+ 400 10px KaTeX_Main',
		'x italic 400 10px KaTeX_Math',
		'y italic 400 10px KaTeX_Math',
		'z italic 400 10px KaTeX_Math'
	]);
	expect(draws.at(-1)!.fillStyle).toBe('red');
});

it('dots the bottom of an unknown command as the DOM field did', () => {
	const error = { kind: 'fill', rect: { x: 0, y: -1, width: 1.2, height: 1.3 }, color: { role: 'error' } } as const;
	const layout = {
		width: 1.2,
		ascent: 1,
		descent: 0.3,
		items: [error],
		atoms: new Map(),
		selection: [],
		macroCalls: [],
		rows: []
	} as unknown as MathLayout;
	const { context, draws } = recordingContext();
	paintMathLayout(context, layout, 0, 0, { size: 10, color: 'black', family: 'serif', role: () => 'pink' });
	expect(draws.map((draw) => `${draw.call} ${draw.fillStyle}`)).toEqual(['fill pink', 'fill hsl(341, 100%, 40%)']);
});
