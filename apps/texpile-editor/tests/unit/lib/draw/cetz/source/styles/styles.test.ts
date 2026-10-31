import { describe, expect, it } from 'vitest';
import { cetzLanguage as lang } from '$lib/draw/cetz/cetzLanguage';

const SRC = `#import "@preview/cetz:0.4.2": canvas, draw

#canvas({
  import draw: *
  rect((0, 0), (2, 1), name: "n1"); content("n1", [A])
})
`;
const at = (text: string, i: number) => lang.readPicture(text, 0)!.statements.find((s) => s.i === i)!;

describe('a CeTZ shape shows through as a TikZ one at an opacity', () => {
	it('fades its border, background and text alike, and keeps it as their colors change', () => {
		const faded = lang.writeStyle(SRC, at(SRC, 2), { opacity: '50', fill: 'blue' })!;
		expect(faded).toContain('rect((0, 0), (2, 1), name: "n1", stroke: black.transparentize(50%), fill: blue.transparentize(50%))');
		expect(faded).toContain('content("n1", text(fill: black.transparentize(50%))[A])');
		const red = lang.writeStyle(faded, at(faded, 2), { stroke: 'red' })!;
		expect(lang.readStyle(red, at(red, 2))).toMatchObject({ stroke: 'red', fill: 'blue', opacity: '50', textColor: 'black' });
	});
});
