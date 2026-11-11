import { describe, it, expect } from 'vitest';
import { buildDrawList } from '$lib/draft/paint/renderCore';

describe('buildDrawList', () => {
	it('places a glyph by its origin and scales its outline to the font size', () => {
		const outline = { commands: [{ type: 'M', x: 0, y: 0 }] };
		const glyph = { index: 5, getPath: (_x: number, _y: number, size: number) => ({ commands: [{ type: 'M', x: size, y: 0 }] }) };
		const fonts: Record<number, unknown> = {
			1: { t1: { outlineForSlot: () => outline }, size: 10 },
			2: { ot: { unitsPerEm: 1000, glyphs: { get: () => glyph } }, size: 10 }
		};
		const records = [
			{ t: 'g', f: 1, c: 65, x: 100, y: 200, ef: 20000 },
			{ t: 'g', f: 2, gi: 5, x: 30, y: 40, xo: 1, yo: 2 }
		];
		const { ops } = buildDrawList(records, (id) => fonts[id] as never, 2);
		expect(ops[0]).toMatchObject({ kind: 'glyph', outline, x: 200, y: 400, sy: 20, hairline: false });
		expect((ops[0] as { sx: number }).sx).toBeCloseTo(20.4);
		// an opentype outline is in font units, read once at the size of its em
		expect(ops[1]).toMatchObject({ kind: 'glyph', x: 62, y: 76, sx: 0.02, sy: 0.02, hairline: true });
		expect((ops[1] as { outline: { commands: { x: number }[] } }).outline.commands[0].x).toBe(1000);
	});
});
