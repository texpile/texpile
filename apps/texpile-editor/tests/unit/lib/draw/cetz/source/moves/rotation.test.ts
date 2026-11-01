import { describe, expect, it } from 'vitest';
import { cetzLanguage as lang } from '$lib/draw/cetz/cetzLanguage';

const SRC = `#import "@preview/cetz:0.4.2": canvas, draw

#canvas({
  import draw: *
  rect((0, 0), (2, 1), name: "n1"); content("n1", [A])
})
`;
const node = (text: string) => lang.readPicture(text, 0)!.statements[1];

describe('a CeTZ shape turns as a TikZ one does', () => {
	it('turns in a scope, its text with it, and two turns make one', () => {
		const once = lang.rotateStatement(SRC, node(SRC), [1, 0.5], 30)!;
		expect(once).toContain(
			'scope({ rotate(30deg, origin: (1, 0.5)); rect((0, 0), (2, 1), name: "n1"); content("n1", [A], angle: 30deg) })'
		);
		expect(lang.readRotation(once, node(once))).toBe(30);
		const twice = lang.rotateStatement(once, node(once), [1, 0.5], 15)!;
		expect(lang.readRotation(twice, node(twice))).toBe(45);
		expect(lang.rotateStatement(twice, node(twice), [1, 0.5], -45)).toBe(SRC);
	});

	it('moves its turn with it', () => {
		const once = lang.rotateStatement(SRC, node(SRC), [1, 0.5], 30)!;
		expect(lang.shiftStatement(once, node(once), 1, 2)).toContain('rotate(30deg, origin: (2, 2.5)); rect((1, 2), (3, 3)');
	});
});
