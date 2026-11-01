import { describe, expect, it } from 'vitest';
import { readRotation, rotateStatement } from '$lib/draw/tikz/source/moves/rotation';
import { readPicture } from '$lib/draw/tikz/source/picture';

const pic = (body: string) => `\\begin{tikzpicture}\n  ${body}\n\\end{tikzpicture}`;
function turn(src: string, center: [number, number], degrees: number, k = 0) {
	return rotateStatement(src, readPicture(src)!.statements[k], center, degrees);
}

describe('rotation', () => {
	it('turns a path about a point, and a second turn about the same point adds up', () => {
		const once = turn(pic('\\draw[thick] (0,0) rectangle (2,1);'), [1, 0.5], 30)!;
		expect(once).toContain('\\draw[rotate around={30:(1,0.5)}, thick] (0,0) rectangle (2,1);');
		const twice = turn(once, [1, 0.5], 60)!;
		expect(twice).toContain('\\draw[rotate around={90:(1,0.5)}, thick]');
		expect(readRotation(twice, readPicture(twice)!.statements[0])).toBe(90);
		// back to none: the key goes
		expect(turn(twice, [1, 0.5], -90)).toContain('\\draw[thick] (0,0) rectangle (2,1);');
	});

	it('turns about another point as one turn about the point both leave the shape at', () => {
		// 90 about (1,0) then 90 about (0,0) is 180 about (0.5,0.5)
		const once = turn(pic('\\draw (0,0) -- (1,0);'), [1, 0], 90)!;
		expect(turn(once, [0, 0], 90)).toContain('\\draw[rotate around={180:(0.5,0.5)}]');
		// a full turn about another point leaves a shift, which the points take
		expect(turn(once, [0, 0], 270)).toContain('\\draw (-1,-1) -- (0,-1);');
	});

	it('turns a node in place by its rotate, and a scope by its options', () => {
		expect(turn(pic('\\node[draw] at (2,0) {A};'), [0, 0], 90)).toContain('\\node[draw, rotate=90] at (0,2) {A};');
		expect(turn(pic('\\begin{scope}\n    \\draw (0,0) -- (1,0);\n  \\end{scope}'), [0, 0], 45)).toContain(
			'\\begin{scope}[rotate around={45:(0,0)}]'
		);
		expect(turn(pic('\\draw (a) -- (b);'), [0, 0], 45)).toBeNull();
	});
});
