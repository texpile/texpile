import { describe, expect, it } from 'vitest';
import { cetzLanguage as lang } from '$lib/draw/cetz/cetzLanguage';

const SRC = `#import "@preview/cetz:0.4.2": canvas, draw

#canvas({
  import draw: *
  rect((0, 0), (2, 1), name: "n1"); content("n1", [A])
})
`;
const at = (text: string, i: number) => lang.readPicture(text, 0)!.statements.find((s) => s.i === i)!;

describe('a CeTZ node beside another, as TikZ places one', () => {
	it('adds the next step below, an arrow to it, and the next one across', () => {
		const once = lang.addStep(SRC, 0, 2, 'south', 'B')!.source;
		expect(once).toContain('rect((rel: (-1, -2), to: "n1.south"), (rel: (2, 1)), name: "n2"); content("n2", [B])');
		expect(once).toContain('line("n1", "n2", mark: (end: "straight"))');
		expect(lang.readPlacement(once, at(once, 3))).toEqual({ direction: 'below', distance: '1cm', of: 'n1' });
		const twice = lang.addStep(once, 0, 2, 'south', 'C')!.source;
		expect(lang.readPlacement(twice, at(twice, 5))).toEqual({ direction: 'right', distance: '1cm', of: 'n2' });
	});

	it('keeps its distance when moved across, and is freed to a point', () => {
		const once = lang.addStep(SRC, 0, 2, 'south', 'B')!.source;
		const moved = lang.shiftStatement(once, at(once, 3), 0.5, -1);
		expect(lang.readPlacement(moved, at(moved, 3))).toEqual({ direction: 'below', distance: '2cm', of: 'n1' });
		expect(lang.writePlacement(once, at(once, 3), { at: [5, 5] })).toContain('rect((4, 4.5), (6, 5.5), name: "n2")');
	});
});
