/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { bandStartLine } from '$lib/draft/locate/bandStart';

// The decision under test: where a block's typeset output actually begins. A block's leading
// source lines need not produce galley of their own -- \centerline{...} makes a plain \hbox,
// which is no paragraph line and emits no pl record -- while the daemon reproducing the block
// as a paragraph counts them in. Its rows then sit one out from the page's and everything
// below renders a baseline high (measured on the kerr abstract: 12pt, first row exactly right).
const pl = (y: number, s: number) => ({ t: 'pl', x: 0, y, w: 200, h: 8, d: 3, s, sf: 1 });

function ctx(recs: any[], srcFiles = ['main.tex']) {
	return {
		paper: () => ({ srcFiles }) as any,
		pageNumbers: () => [1],
		pageRecords: () => recs,
		emit: () => {}
	} as any;
}

describe('bandStartLine', () => {
	it('starts the band at the first source line that produced a galley line', () => {
		// \centerline{Abstract} on 687, the paragraph on 688: every page line says 688
		const recs = [pl(100, 688), pl(113, 688), pl(127, 688)];
		expect(bandStartLine(ctx(recs), 'main.tex', 687, 690)).toBe(688);
	});

	it('leaves a block whose first line already produced galley alone', () => {
		expect(bandStartLine(ctx([pl(100, 687), pl(113, 687)]), 'main.tex', 687, 690)).toBe(687);
	});

	it('narrows to the earliest stamp, not the first record emitted', () => {
		// records arrive in page order, and a block can straddle a column: the SMALLEST stamp
		// is the block's start wherever its lines ended up
		const recs = [pl(100, 689), pl(113, 688), pl(127, 689)];
		expect(bandStartLine(ctx(recs), 'main.tex', 687, 690)).toBe(688);
	});

	it('never narrows past the block', () => {
		// a stamp outside the range cannot start this band; the range filter keeps it out and
		// an empty result leaves the caller's own line standing
		expect(bandStartLine(ctx([pl(100, 900)]), 'main.tex', 687, 690)).toBe(687);
	});

	it('leaves a block alone when nothing is stamped', () => {
		// an engine without the attribute, or a file the stamp never named: absent means
		// unknown, and narrowing on unknown would drop text the splice still has to replace
		expect(bandStartLine(ctx([{ t: 'pl', x: 0, y: 100, w: 200, h: 8, d: 3 }]), 'main.tex', 687, 690)).toBe(687);
		expect(bandStartLine(ctx([pl(100, 688)], []), 'main.tex', 687, 690)).toBe(687);
	});

	it('leaves a single-line block alone without asking', () => {
		expect(bandStartLine(ctx([pl(100, 688)]), 'main.tex', 687, 687)).toBe(687);
	});
});
