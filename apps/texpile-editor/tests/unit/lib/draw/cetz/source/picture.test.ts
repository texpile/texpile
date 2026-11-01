import { describe, expect, it } from 'vitest';
import { listPictures, readPicture } from '$lib/draw/cetz/source/picture';

describe('finding CeTZ pictures', () => {
	it('finds a canvas under the name the file imports CeTZ by, and its draw calls', () => {
		const src = '#import "@preview/cetz:0.4.2" as c\n#c.canvas({\n  c.draw.line((0, 0), (1, 1))\n})';
		expect(listPictures(src)).toHaveLength(1);
		const picture = readPicture(src)!;
		expect(picture.prefix).toBe('c.draw.');
		expect(picture.statements.map((s) => [s.kind, s.command])).toEqual([['path', 'line']]);
	});

	it('passes over a canvas in a string or a comment, not one after a string holding //', () => {
		const canvas = '#cetz.canvas({ cetz.draw.line((0, 0), (1, 1)) })';
		const src = `#import "@preview/cetz:0.4.2"\n// ${canvas}\n#let s = "${canvas}"\n#let u = "http://a" ${canvas}\n`;
		expect(listPictures(src).map((p) => src.slice(0, p.from).split('\n').length)).toEqual([4]);
	});
});
