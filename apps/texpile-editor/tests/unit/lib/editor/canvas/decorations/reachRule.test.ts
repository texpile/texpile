import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { reachOf } from '$lib/editor/canvas/decorations/reachRule';

type RecordedMark = { elements?: { class: string; rects: { reach: 'line' | 'text' }[] }[] };

const GEOMETRY = join(import.meta.dirname, '../../../../../fixtures/parity/geometry');

// a run in another font (code, large text) fills its own inline box, shorter or taller than the line (decorationBands.ts)
describe('the reach of a decoration against the DOM editor’s rects', () => {
	for (const doc of ['parity-tex-body__main_tex', 'parity-md-body__main_md'])
		it(`fills ${doc}'s comment, pending comment and peer selection as far as most of their recorded rects`, () => {
			const { schemes } = JSON.parse(readFileSync(join(GEOMETRY, `${doc}@marks.json`), 'utf8')) as {
				schemes: { light: Record<string, RecordedMark> };
			};
			const reaches: Record<string, string> = {};
			for (const id of ['comment', 'comment-pending', 'peer-selection']) {
				const elements = (schemes.light[id]?.elements ?? []).filter((element) => /\bpm-(comment|remote-sel)/.test(element.class));
				const recorded = elements.flatMap((element) => element.rects.map((rect) => rect.reach));
				const line = recorded.filter((reach) => reach === 'line').length;
				expect(recorded.length, id).toBeGreaterThan(2);
				reaches[id] = `${reachOf(elements[0].class.split(' '))} (recorded ${line * 2 > recorded.length ? 'line' : 'text'})`;
			}
			expect(reaches).toEqual({
				comment: 'text (recorded text)',
				'comment-pending': 'line (recorded line)',
				'peer-selection': 'line (recorded line)'
			});
		});
});
