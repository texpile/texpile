import { describe, expect, it } from 'vitest';
import { replacePicture } from '$lib/draw/cetz/source/pictures';

describe('a starter picked for a canvas', () => {
	it('replaces that canvas, the ones before it left alone', () => {
		const kind = { id: 'x', name: 'X', text: '#canvas({ line((1, 1), (2, 2)) })\n', usepackage: null, libraries: [] };
		const head = '#import "@preview/cetz:0.4.2": canvas, draw\n';
		const first = '#canvas({ circle((0, 0)) })';
		expect(replacePicture(`${head}${first}\n#canvas({})\n`, kind, 1)).toBe(`${head}${first}\n#canvas({ line((1, 1), (2, 2)) })\n`);
	});
});
