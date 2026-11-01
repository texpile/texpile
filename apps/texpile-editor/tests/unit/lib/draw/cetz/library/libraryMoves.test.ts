// each element dropped as the editor drops one, moved off the origin, lands where the move says
import { describe, expect, it } from 'vitest';
import { hasTinymist, tinymistEngine, useTinymist } from '../../engines/tinymistEngine';
import type { Drawing } from '$lib/draw/editor/drawing/drawing.types';
import { cetzLanguage as lang } from '$lib/draw/cetz/cetzLanguage';
import { LIBRARY_ELEMENTS } from '$lib/draw/cetz/library/libraryElements';
import { NEW_PICTURE } from '$lib/draw/cetz/source/pictures';

const CM = 72 / 2.54;

function box(drawing: Drawing) {
	const n = drawing.parts.flatMap((p) => (p.kind === 'path' ? (p.d.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number) : []));
	const xs = n.filter((_, k) => k % 2 === 0);
	const ys = n.filter((_, k) => k % 2 === 1);
	return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

describe.skipIf(!hasTinymist)('library moves', () => {
	useTinymist();
	const engine = tinymistEngine;

	it('moves every element it adds by what it is dropped at', async () => {
		const misses: string[] = [];
		const before = lang.readPicture(NEW_PICTURE, 0)!.statements.length;
		for (const e of LIBRARY_ELEMENTS) {
			const added = lang.addElement(NEW_PICTURE, 0, e)!;
			const picture = lang.readPicture(added, 0)!;
			const fresh = picture.statements.filter(
				(s) => s.i > before && !picture.statements.some((o) => o !== s && o.kind === 'scope' && o.from <= s.from && s.to <= o.to)
			);
			const unmoved = fresh.filter((s) => !lang.describe(added, s).movable);
			if (unmoved.length) {
				misses.push(`${e.id}: ${unmoved.map((s) => lang.describe(added, s).title).join(', ')} stays`);
				continue;
			}
			const moved = [...fresh].sort((a, b) => b.from - a.from).reduce((text, st) => lang.shiftStatement(text, st, 2, 1) ?? text, added);
			const [was, now] = await Promise.all([added, moved].map((s) => lang.render(engine, s, lang.readPicture(s, 0)!)));
			expect(now.errors, `${e.id}\n${moved}`).toEqual([]);
			const [a, b] = [box(was.drawing), box(now.drawing)];
			const off = a.map((v, k) => b[k] - v - (k % 2 ? CM : 2 * CM));
			if (off.some((d) => Math.abs(d) > 0.5)) misses.push(`${e.id}: off by ${off.map((d) => d.toFixed(1)).join(' ')}`);
		}
		expect(misses).toEqual([]);
	}, 300_000);
});
