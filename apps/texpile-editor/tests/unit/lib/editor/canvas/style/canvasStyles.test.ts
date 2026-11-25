import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { faceElement } from '$lib/editor/canvas';
import type { LayoutStyle, PaintStyle, Rgba, RunChainLevel, RunStyle, StyleBase, StyleLook } from '$lib/editor/canvas/contracts/styleTypes';
import type { FaceElement } from '$lib/editor/canvas/tree/faceElement';
import { CanvasStyleResolver } from '$lib/editor/canvas/style/canvasStyles';

type Recording = {
	initial: { layout: LayoutStyle; paint: PaintStyle };
	values: { layout: object[]; paint: object[]; run: object[] };
	rows: [number, string, string, string, number, number][];
	runs: [number, number, number, string[], number][];
};

function expand<T>(delta: unknown, base: T): T {
	if (!delta || typeof delta !== 'object' || Array.isArray(delta) || !base || typeof base !== 'object') return (delta ?? base) as T;
	const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
	for (const [key, value] of Object.entries(delta)) out[key] = expand(value, (base as Record<string, unknown>)[key]);
	return out as T;
}

function recording(name: string): Recording {
	return JSON.parse(readFileSync(join(import.meta.dirname, '../../../../../fixtures/parity/styles', name), 'utf8')) as Recording;
}

function recordedRow(file: Recording, pos: number, path: string): { layout: LayoutStyle; paint: PaintStyle } {
	const row = file.rows.find((r) => r[0] === pos && r[2] === path && r[3] === '')!;
	return { layout: expand(file.values.layout[row[4]], file.initial.layout), paint: expand(file.values.paint[row[5]], file.initial.paint) };
}

function colorCss({ r, g, b, a }: Rgba): string {
	return `rgb(${r * 255} ${g * 255} ${b * 255} / ${a})`;
}

function expectColor(actual: Rgba, recorded: Rgba): void {
	for (const channel of ['r', 'g', 'b'] as const) expect(Math.abs(actual[channel] - recorded[channel])).toBeLessThanOrEqual(2 / 255);
	expect(Math.abs(actual.a - recorded.a)).toBeLessThanOrEqual(0.01);
}

const TAGS: Record<string, StyleLook> = { p: { display: 'block' } };
const BASE: StyleBase = { root: () => ({}), tag: (tag) => TAGS[tag] ?? null, node: () => null, selectedNode: () => null };
// declared as texpile-tokens.css writes them: relative to the element's own text color
const TOKENS: Record<string, string> = {
	'--radius-base': '4px',
	'--muted-share': '60%',
	'--faint-share': '40%',
	'--muted-text': 'color-mix(in oklab, currentColor var(--muted-share), transparent)',
	'--faint-text': 'color-mix(in oklab, currentColor var(--faint-share), transparent)',
	'--proof-spelling': 'rgb(255, 0, 0)',
	'--color-surface-200': 'oklch(0.8485 0.01 247.93)'
};

function resolver(): CanvasStyleResolver {
	return new CanvasStyleResolver({ base: BASE, tokens: (name) => TOKENS[name] ?? null });
}

function element(tag: string, css: string, parent?: FaceElement): FaceElement {
	const el = faceElement(tag);
	if (css) el.style.cssText = css;
	parent?.appendChild(el);
	return el;
}

/** a paragraph of parity-tex-body as the recording computed it */
function paragraph(row: { layout: LayoutStyle; paint: PaintStyle }): FaceElement {
	const { font, lineHeight } = row.layout;
	const factor = (lineHeight as number) / font.sizePx;
	return element('p', `font-size: ${font.sizePx}px; line-height: ${factor}; color: ${colorCss(row.paint.color)}`);
}

const MARGIN_NOTE: StyleLook = {
	padding: '0 0.35em',
	borderRadius: 'var(--radius-base)',
	backgroundColor: 'color-mix(in srgb, var(--faint-text) 14%, transparent)',
	color: 'var(--muted-text)',
	fontSize: '0.85em'
};

describe('CanvasStyleResolver', () => {
	const body = recording('parity-tex-body__main_tex@light.json');
	const note = recordedRow(body, 1185, 'span.drawn-margin-note:0');

	it('inherits a unitless line height as a factor, sizes em against the parent font and takes inherit', () => {
		const styles = resolver();
		const p = paragraph(recordedRow(body, 1180, ''));
		const chip = element('span', '', p);
		const marginNote = element('span', '', chip);
		Object.assign(marginNote.style, MARGIN_NOTE);
		const parts = element('span', 'padding: inherit', marginNote);
		const noteStyle = styles.styleOf(marginNote)!.layout;
		expect(noteStyle.font.sizePx).toBeCloseTo(note.layout.font.sizePx, 2);
		expect(noteStyle.lineHeight as number).toBeCloseTo(note.layout.lineHeight as number, 1);
		expect(noteStyle.padding.left.px).toBeCloseTo(note.layout.padding.left.px, 2);
		const partsStyle = styles.styleOf(parts)!.layout;
		expect(partsStyle.padding.left.px).toBeCloseTo(note.layout.padding.left.px, 2);
		expect(partsStyle.lineHeight).toBe(noteStyle.lineHeight);
	});

	it('resolves color-mix() over var() tokens relative to currentColor as the DOM editor computed them', () => {
		const styles = resolver();
		const marginNote = element('span', '', element('span', '', paragraph(recordedRow(body, 1180, ''))));
		Object.assign(marginNote.style, MARGIN_NOTE);
		const { paint } = styles.styleOf(marginNote)!;
		expectColor(paint.color, note.paint.color);
		expectColor(paint.backgroundColor, note.paint.backgroundColor);
		expect(paint.borderRadius).toEqual(note.paint.borderRadius);
	});

	it('gives a code mark run its padding as edges and inherits the line height factor into it', () => {
		const markdown = recording('parity-md-body__main_md@light.json');
		const run = markdown.runs.find((r) => r[3].join() === 'code')!;
		const recorded = markdown.values.run[run[4]] as RunStyle;
		const block = paragraph(recordedRow(markdown, run[0], ''));
		const code: RunChainLevel = {
			tag: 'code',
			classes: [],
			attrs: {},
			hovered: false,
			look: {
				fontSize: '0.95em',
				padding: '0.125rem 0.25rem',
				borderRadius: '0.25rem',
				whiteSpace: 'nowrap',
				backgroundColor: 'var(--color-surface-200)'
			}
		};
		const style = resolver().runStyle(block, { key: 'code', levels: [code] });
		expect(style.edges).toEqual(recorded.edges);
		expect(style.blockEdges).toEqual({ top: 2, bottom: 2 });
		expect(style.font.sizePx).toBeCloseTo(recorded.font.sizePx, 2);
		expect(style.lineHeight as number).toBeCloseTo(recorded.lineHeight as number, 1);
		expectColor(style.paint.backgroundColor, expand(recorded.paint.backgroundColor, markdown.initial.paint.backgroundColor));
	});

	it('puts a decoration hover delta on the paint half only', () => {
		const styles = resolver();
		const block = element('p', 'color: rgb(0 0 0)');
		const level = (hovered: boolean): RunChainLevel => ({
			tag: 'span',
			classes: ['proofread-spelling'],
			attrs: {},
			hovered,
			look: { backgroundColor: 'color-mix(in srgb, var(--proof-spelling) 8%, transparent)' },
			hoverLook: { backgroundColor: 'color-mix(in srgb, var(--proof-spelling) 12%, transparent)' }
		});
		const rest = styles.runStyle(block, { key: 'proofread', levels: [level(false)] });
		const hovered = styles.runStyle(block, { key: 'proofread', levels: [level(true)] });
		expect(rest.paint.backgroundColor).toEqual({ r: 1, g: 0, b: 0, a: 0.08 });
		expect(hovered.paint.backgroundColor).toEqual({ r: 1, g: 0, b: 0, a: 0.12 });
		expect(hovered.layoutKey).toBe(rest.layoutKey);
		expect(hovered.paintKey).not.toBe(rest.paintKey);
	});

	// a document's colors reach marks' toDOM as written: named ones resolve, ones the DOM drops are dropped, never a throw
	it('resolves a named color and drops a value the DOM drops', () => {
		const styles = resolver();
		const parent = element('p', 'color: rgb(0 0 0)');
		const red = element('span', 'color: red; background-color: yellow', parent);
		const odd = element('span', 'color: .2,.4,.6; font-variant: small-caps', parent);
		expect(styles.styleOf(red)!.paint.color).toEqual({ r: 1, g: 0, b: 0, a: 1 });
		expect(styles.styleOf(red)!.paint.backgroundColor).toEqual({ r: 1, g: 1, b: 0, a: 1 });
		expect(styles.styleOf(odd)!.paint.color).toEqual({ r: 0, g: 0, b: 0, a: 1 });
	});

	it("takes a look's light-dark() side from the scheme", () => {
		const look = 'color: light-dark(rgb(10 20 30), rgb(200 210 220))';
		for (const [dark, r] of [
			[false, 10],
			[true, 200]
		] as const) {
			const styles = new CanvasStyleResolver({ base: BASE, tokens: (name) => TOKENS[name] ?? null, dark: () => dark });
			expect(Math.round(styles.styleOf(element('p', look))!.paint.color.r * 255)).toBe(r);
		}
	});
});

it('a part following its card shows its hover look while any of the card is hovered', () => {
	const styles = resolver();
	const card = element('div', '');
	const picture = element('span', '', card);
	const pencil = element('span', 'opacity: 0', card);
	pencil.states = { hover: { opacity: '1' } };
	pencil.statesFrom = card;
	expect(styles.styleOf(pencil)!.paint.opacity).toBe(0);
	styles.setState(picture, 'hover', true);
	expect(styles.styleOf(pencil)!.paint.opacity).toBe(1);
});
