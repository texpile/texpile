// the gap cursor and remote caret looks against the DOM editor's 4x shots (looks/chrome)
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { faceElement } from '$lib/editor/canvas';
import { GAP_CURSOR_LOOK, remoteCaretLooks } from '$lib/editor/canvas/paint/caretLooks';
import { CanvasStyleResolver } from '$lib/editor/canvas/style/canvasStyles';
import { longestRun, readPng, type Pixels } from '../style/parity/pngPixels';
import { parityTokens } from '../style/parity/parityTokens';

const CHROME = join(import.meta.dirname, '../../../../../fixtures/parity/looks/chrome');
const SCALE = 4;
const BASE = { root: () => ({}), tag: () => null, node: () => null, selectedNode: () => null };

function isPurple(pixels: Pixels, x: number, y: number): boolean {
	const [r, g, b] = pixels.at(x, y);
	return Math.abs(r - 124) < 12 && Math.abs(g - 58) < 12 && Math.abs(b - 237) < 12;
}

describe('caret looks', () => {
	it('draws the gap cursor bar as wide and thick as the DOM editor did', () => {
		const shot = readPng(join(CHROME, 'light-gapcursor-between-displays.png'));
		const bar = Array.from({ length: shot.height }, (_, y) => ({ y, ...longestRun(shot, y) })).filter(
			(row) => row.length >= 60 && row.length <= 100 && row.from < 200
		);
		expect(bar.length / SCALE).toBe(GAP_CURSOR_LOOK.thickness);
		expect(bar[0].length / SCALE).toBe(GAP_CURSOR_LOOK.width);
	});

	it('sizes the remote caret bar and its name label as the DOM editor did', () => {
		const shot = readPng(join(CHROME, 'light-remote-caret.png'));
		const column = (x: number): number[] => Array.from({ length: shot.height }, (_, y) => y).filter((y) => isPurple(shot, x, y));
		// the label's padding, left of its text and right of the bar
		const labelRows = column(490);
		const barColumns = Array.from({ length: 30 }, (_, i) => 470 + i).filter((x) => isPurple(shot, x, 190));
		const styles = new CanvasStyleResolver({ base: BASE, tokens: parityTokens('light') });
		const looks = remoteCaretLooks('#7c3aed');
		const line = faceElement('span');
		line.style.cssText = 'font-size: 17.072px; line-height: 1.6396';
		const bar = faceElement('span');
		Object.assign(bar.style, looks.bar);
		const label = faceElement('span');
		Object.assign(label.style, looks.label);
		line.appendChild(bar).appendChild(label);
		const labelStyle = styles.styleOf(label)!.layout;
		expect(barColumns.length / SCALE).toBe(2);
		expect(styles.styleOf(bar)!.layout.width).toEqual({ px: 2, percent: 0 });
		expect((labelStyle.lineHeight as number) * SCALE).toBeCloseTo(labelRows.length, 0);
		expect(styles.styleOf(label)!.paint.backgroundColor).toEqual({ r: 124 / 255, g: 58 / 255, b: 237 / 255, a: 1 });
	});
});
