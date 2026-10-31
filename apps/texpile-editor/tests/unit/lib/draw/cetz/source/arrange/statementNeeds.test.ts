import { describe, expect, it } from 'vitest';
import { cetzLanguage as lang } from '$lib/draw/cetz/cetzLanguage';

const SRC = `#import "@preview/cetz:0.4.2": canvas, draw

#canvas({
  import draw: *
  let w = 2
  rect((0, 0), (w, 1))
  content((1, 4), [A], name: "a")
  line("a", (4, 2))
})
`;
const at = (i: number) => lang.readPicture(SRC, 0)!.statements.find((s) => s.i === i)!;

describe('what a CeTZ edit takes from a statement', () => {
	it('refuses deleting the import, a variable in use or grouping a named element away', () => {
		expect(lang.brokenNeed(SRC, lang.removeStatement(SRC, at(1)), 0)).toBe('the rectangle uses the draw functions imported');
		expect(lang.brokenNeed(SRC, lang.removeStatement(SRC, at(2)), 0)).toBe('the rectangle uses w');
		const grouped = lang.groupStatements(SRC, lang.readPicture(SRC, 0)!, [4])!.source;
		expect(lang.brokenNeed(SRC, grouped, 0)).toBe('the line uses the element a, which holds only inside a group the line is not in');
	});

	it('lets an edit through that nothing needs', () => {
		expect(lang.brokenNeed(SRC, lang.removeStatement(SRC, at(5)), 0)).toBeNull();
		expect(lang.brokenNeed(SRC, lang.groupStatements(SRC, lang.readPicture(SRC, 0)!, [3, 4, 5])!.source, 0)).toBeNull();
	});
});
