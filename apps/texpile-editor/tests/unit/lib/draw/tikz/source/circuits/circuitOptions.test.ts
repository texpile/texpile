import { describe, expect, it } from 'vitest';
import { readCircuit, writeCircuit } from '$lib/draw/tikz/source/circuits/circuitOptions';
import { readPicture } from '$lib/draw/tikz/source/picture';

function first(src: string) {
	const picture = readPicture(src)!;
	return { picture, st: picture.statements[0] };
}
const pic = (body: string) => `\\begin{circuitikz}\n  ${body}\n\\end{circuitikz}`;

describe('circuit parts', () => {
	it('reads each part a path draws, with its label, voltage and current', () => {
		const src = pic('\\draw (0,0) to[V, v=$V_s$] (0,2) to[R=$R_1$, i>^=$i$] (2,2) to[C, l_=$C$] (2,0) -- (0,0);');
		const { picture, st } = first(src);
		expect(picture.circuit).toBe(true);
		expect(readCircuit(src, st)).toEqual([
			{ type: 'V', placed: 'path', label: null, voltage: '$V_s$', current: null },
			{ type: 'R', placed: 'path', label: '$R_1$', voltage: null, current: '$i$' },
			{ type: 'C', placed: 'path', label: '$C$', voltage: null, current: null }
		]);
	});

	it('changes a part and keeps the rest of its options', () => {
		const src = pic('\\draw (0,0) to[R=$R_1$, *-*] (2,0);');
		const { st } = first(src);
		expect(writeCircuit(src, st, 0, { type: 'C' })).toContain('to[C=$R_1$, *-*]');
		expect(writeCircuit(src, st, 0, { label: '' })).toContain('to[R, *-*]');
		expect(writeCircuit(src, st, 0, { voltage: 'a, b' })).toContain('to[R=$R_1$, *-*, v={a, b}]');
		// a node part keeps to the node parts
		expect(writeCircuit(src, st, 0, { type: 'ground' })).toBeNull();
	});

	it('reads a ground or a transistor placed as a node, and a bend as no part', () => {
		const src =
			'\\begin{tikzpicture}\n  \\node[npn] (Q1) at (1,1) {};\n  \\draw (0,0) node[ground] {};\n  \\draw (a) to[bend left] (b);\n\\end{tikzpicture}';
		const picture = readPicture(src)!;
		expect(picture.statements.map((s) => readCircuit(src, s).map((p) => p.type))).toEqual([['npn'], ['ground'], []]);
		expect(writeCircuit(src, picture.statements[0], 0, { type: 'pnp' })).toContain('\\node[pnp] (Q1)');
		expect(readPicture('\\begin{tikzpicture}\\draw (a) to[bend left] (b);\\end{tikzpicture}')!.circuit).toBe(false);
	});
});
