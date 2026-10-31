import { describe, expect, it } from 'vitest';
import type { SourceTransform } from '$lib/draw/editor/figure/geometry';
import { BP_PER_CM } from '$lib/draw/editor/figure/lengthUnits';
import { dimensionedSource } from '$lib/draw/editor/state/dimension/dimensionEdits';
import { dimensionValue } from '$lib/draw/editor/state/dimension/geometry/dimensionGeometry';
import { dimensionAt } from '$lib/draw/editor/state/dimension/hits/dimensionHits';
import { placementAt } from '$lib/draw/editor/state/dimension/dimensionPlacement';
import { readPicture } from '$lib/draw/tikz/source/picture';
import { tikzLanguage } from '$lib/draw/tikz/tikzLanguage';

const CM: SourceTransform = [BP_PER_CM, 0, 0, BP_PER_CM, 0, 0];

function hitIn(source: string, [u, v]: [number, number], m: SourceTransform = CM) {
	const statements = readPicture(source)!.statements;
	const scene = { language: tikzLanguage, source, statements, transformOf: () => m, outlines: [] };
	return dimensionAt(scene, [u * BP_PER_CM, v * BP_PER_CM], 6, 4);
}

/** the dimension picked at `at`, put with the pointer at `put` (there too by default), set to `cm` */
function dimensioned(source: string, at: [number, number], cm: number, m: SourceTransform = CM, put: [number, number] = at) {
	const hit = hitIn(source, at, m);
	if (!hit || !('target' in hit)) throw new Error(`nothing to dimension at ${at}`);
	return dimensionedSource(tikzLanguage, source, hit.target, placementAt(hit.target, [put[0] * BP_PER_CM, put[1] * BP_PER_CM]), cm);
}

const picture = (body: string) => `\\begin{tikzpicture}\n  ${body}\n\\end{tikzpicture}`;

describe('dimensions', () => {
	it('sets a segment written relative to its start, and the point after it stays put', () => {
		expect(dimensioned(picture('\\draw (0,0) -- ++(2,0) -- ++(0,1);'), [1, 0], 3)).toContain('\\draw (0,0) -- ++(3,0) -- ++(-1,1);');
	});

	it('measures what the paper shows under a scale, and sets a radius the same way', () => {
		const scaled: SourceTransform = [2 * BP_PER_CM, 0, 0, 2 * BP_PER_CM, 0, 0];
		expect(dimensioned(picture('\\draw (0,0) -- (1,0);'), [1, 0], 4, scaled)).toContain('-- (2,0);');
		expect(dimensioned(picture('\\draw (0,0) circle[radius=1];'), [2, 0], 3, scaled)).toContain('circle[radius=1.5]');
	});

	it('leaves curves, arcs and control points alone', () => {
		expect(hitIn(picture('\\draw (0,0) .. controls (1,1) and (2,1) .. (3,0);'), [1.5, 0.75])).toBeNull();
		expect(hitIn(picture('\\draw (0,0) to[bend left] (3,0);'), [1.5, 0])).toBeNull();
	});
});

describe('dimensions of every element', () => {
	it('reads a polygon closing side, a grid and a straight to', () => {
		expect(dimensioned(picture('\\draw (0,0) -- (4,0) -- (4,3) -- cycle;'), [2, 1.5], 10)).toContain('-- (8,6) -- cycle;');
		expect(dimensioned(picture('\\draw (0,0) grid (4,3);'), [2, 0], 5)).toContain('grid (5,3);');
		expect(dimensioned(picture('\\draw (0,0) to[R] (2,0);'), [1, 0], 3)).toContain('to[R] (3,0);');
	});
});

describe('dimensions of arcs', () => {
	it('sets an arc radius in either way it is written', () => {
		expect(dimensioned(picture('\\draw (2,0) arc[start angle=0, end angle=90, radius=2];'), [0, 2], 3)).toContain('radius=3]');
		expect(dimensioned(picture('\\draw (2,0) arc (0:90:2);'), [Math.SQRT2, Math.SQRT2], 1)).toContain('arc (0:90:1);');
	});
});

describe('angles', () => {
	it('turns the second segment about the corner the two share, on the side it is on', () => {
		const source = picture('\\draw (0,0) -- (3,0) -- (3,2);');
		const [first, second] = [hitIn(source, [1.5, 0]), hitIn(source, [3, 1])];
		if (!first || !second || !('target' in first) || !('target' in second)) throw new Error('no segments');
		if (first.target.kind !== 'length' || second.target.kind !== 'length') throw new Error('not segments');
		const angle = { kind: 'angle' as const, from: first.target, to: second.target };
		// the pointer inside the corner picks the angle there, not its outside
		const inside = placementAt(angle, [2.5 * BP_PER_CM, 0.5 * BP_PER_CM]);
		expect(dimensionValue(angle, inside)).toBeCloseTo(90);
		expect(dimensionedSource(tikzLanguage, source, angle, inside, 45)).toContain('\\draw (0,0) -- (3,0) -- (1.59,1.41);');
	});

	it('writes the turned end where its angle is printed as typed', () => {
		const source = picture('\\draw (2,1) -- (6,1);\n  \\draw (2,1) -- (4,5);');
		const [first, second] = [hitIn(source, [4, 1]), hitIn(source, [3, 3])];
		if (!first || !second || !('target' in first) || !('target' in second)) throw new Error('no segments');
		if (first.target.kind !== 'length' || second.target.kind !== 'length') throw new Error('not segments');
		const angle = { kind: 'angle' as const, from: first.target, to: second.target };
		const next = dimensionedSource(tikzLanguage, source, angle, placementAt(angle, [3 * BP_PER_CM, 1.5 * BP_PER_CM]), 60)!;
		const [, u, v] = /\(2,1\) -- \((-?[\d.]+),(-?[\d.]+)\);\s*\\end/.exec(next)!.map(Number);
		expect(((Math.atan2(v - 1, u - 2) * 180) / Math.PI).toFixed(1)).toBe('60.0');
	});
});

describe('where a dimension is put', () => {
	it('measures across from above or below what it measures, and along it from beside the line', () => {
		const source = picture('\\draw (0,0) -- (3,4);');
		expect(dimensioned(source, [1.5, 2], 6, CM, [1.5, 5])).toContain('\\draw (0,0) -- (6,4);');
		expect(dimensioned(source, [1.5, 2], 10, CM, [0.5, 2.5])).toContain('\\draw (0,0) -- (6,8);');
	});
});
