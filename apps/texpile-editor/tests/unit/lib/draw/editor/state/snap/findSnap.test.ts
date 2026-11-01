import { describe, expect, it } from 'vitest';
import { findSnap, trackSnap } from '$lib/draw/editor/state/snap/findSnap';
import type { SnapScene } from '$lib/draw/editor/state/snap/snapScene.types';

const scene: SnapScene = {
	points: [
		{ stmt: 1, at: [0, 0], kind: 'endpoint' },
		{ stmt: 1, at: [100, 0], kind: 'endpoint' },
		{ stmt: 1, at: [50, 0], kind: 'midpoint' },
		{ stmt: 2, at: [50, 50], kind: 'center' }
	],
	segments: [
		{ stmt: 1, a: [0, 0], b: [100, 0] },
		{ stmt: 3, a: [80, -40], b: [80, 40] }
	],
	circles: [{ stmt: 2, center: [50, 50], rx: 30, ry: 30 }]
};

function snapAt(at: [number, number], from: [number, number] | null = null, exclude: number[] = []) {
	return findSnap(scene, { at, reach: 8, exclude, from });
}

describe('object snaps', () => {
	it('finds what stands near the pointer, an intersection near it, and a circle center from its outline', () => {
		expect(snapAt([2, 3])).toEqual({ at: [0, 0], kind: 'endpoint' });
		expect(snapAt([79, 3])).toEqual({ at: [80, 0], kind: 'intersection' });
		expect(snapAt([50, 81])).toEqual({ at: [50, 50], kind: 'center' });
		expect(snapAt([50, 81], null, [2])).toBeNull();
	});

	it('finds the foot of the perpendicular from where a line starts', () => {
		expect(snapAt([30, 4], [30, 60])).toEqual({ at: [30, 0], kind: 'perpendicular' });
	});

	it('lines a point up with an end across, the grid keeping the other axis', () => {
		expect(trackSnap(scene, [99, 30], [99.5, 30.5], 4, [])?.point).toEqual([100, 30.5]);
	});
});
