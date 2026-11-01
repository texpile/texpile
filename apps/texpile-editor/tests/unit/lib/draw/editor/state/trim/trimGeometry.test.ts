import { describe, expect, it } from 'vitest';
import type { Point } from '$lib/draw/editor/figure/geometry';
import { trimCut } from '$lib/draw/editor/state/trim/trimGeometry';

type Segment = [Point, Point];
const vertical = (x: number): Segment => [
	[x, -5],
	[x, 5]
];

function runs(...pieces: Point[][]) {
	return { kind: 'polyline', runs: pieces.map((points) => ({ points, closed: false })) };
}

describe('trimming', () => {
	it('cuts a line between the crossings either side of the click, and leaves both ends as one path', () => {
		const line = { kind: 'polyline' as const, runs: [{ points: [[0, 0] as Point, [10, 0] as Point], closed: false }] };
		expect(trimCut(line, [vertical(3), vertical(6)], [4, 0.1], 0.01)?.left).toEqual(
			runs(
				[
					[0, 0],
					[3, 0]
				],
				[
					[6, 0],
					[10, 0]
				]
			)
		);
		// past the last crossing, to its end
		expect(trimCut(line, [vertical(3)], [8, 0], 0.01)?.left).toEqual(
			runs([
				[0, 0],
				[3, 0]
			])
		);
		// nothing crosses it: it goes whole
		expect(trimCut(line, [], [8, 0], 0.01)?.left).toBeNull();
	});

	it('opens a closed outline where it is cut, and a circle into the arc that is left', () => {
		const box = {
			kind: 'polyline' as const,
			runs: [
				{
					points: [
						[0, 0],
						[4, 0],
						[4, 2],
						[0, 2]
					] as Point[],
					closed: true
				}
			]
		};

		expect(trimCut(box, [vertical(1), vertical(3)], [2, 2], 0.01)?.left).toEqual(
			runs([
				[1, 2],
				[0, 2],
				[0, 0],
				[4, 0],
				[4, 2],
				[3, 2]
			])
		);
		const circle = { kind: 'ellipse' as const, center: [0, 0] as Point, rx: 2, ry: 2 };
		const left = trimCut(circle, [vertical(0)], [2, 0], 0.01)?.left;
		expect(left).toMatchObject({ kind: 'arcs', spans: [[90, 270]] });
		// an arc of it cut again keeps the arcs either side
		const arc = { ...circle, spans: [[90, 270]] as [number, number][] };
		expect(trimCut(arc, [vertical(-1)], [-2, 0], 0.01)?.left).toMatchObject({
			kind: 'arcs',
			spans: [
				[90, 120],
				[240, 270]
			]
		});
	});

	it('takes one side of an outline nothing crosses, its corners bounding it, and never a sliver', () => {
		const box = {
			kind: 'polyline' as const,
			runs: [
				{
					points: [
						[0, 0],
						[4, 0],
						[4, 2],
						[0, 2]
					] as Point[],
					closed: true
				}
			]
		};
		expect(trimCut(box, [], [0, 1], 0.01)?.left).toEqual(
			runs([
				[0, 0],
				[4, 0],
				[4, 2],
				[0, 2]
			])
		);
		// a cutter just short of the end leaves no piece of nothing
		const line = { kind: 'polyline' as const, runs: [{ points: [[0, 0] as Point, [10, 0] as Point], closed: false }] };
		expect(trimCut(line, [vertical(9.999)], [5, 0], 0.01)?.left).toBeNull();
	});

	it('cuts the run of lines clicked and keeps the others as they are', () => {
		const two = {
			kind: 'polyline' as const,
			runs: [
				{
					points: [
						[0, 0],
						[3, 0]
					] as Point[],
					closed: false
				},
				{
					points: [
						[0, 1],
						[10, 1]
					] as Point[],
					closed: false
				}
			]
		};
		expect(trimCut(two, [vertical(5)], [8, 1], 0.01)?.left).toEqual(
			runs(
				[
					[0, 0],
					[3, 0]
				],
				[
					[0, 1],
					[5, 1]
				]
			)
		);
	});

	it('takes a cutter that ends a hair short of the outline as meeting it', () => {
		const line = { kind: 'polyline' as const, runs: [{ points: [[0, 0] as Point, [10, 0] as Point], closed: false }] };
		const short: Segment = [
			[5, 0.004],
			[5, 3]
		];
		expect(trimCut(line, [short], [8, 0], 0.01)?.left).toEqual(
			runs([
				[0, 0],
				[5, 0]
			])
		);
	});
});
