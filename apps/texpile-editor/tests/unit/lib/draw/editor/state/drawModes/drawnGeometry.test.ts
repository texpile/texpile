import { describe, expect, it } from 'vitest';
import { drawnGeometry } from '$lib/draw/editor/state/drawModes/drawnGeometry';

const plain = { square: false };

describe('drawn geometry', () => {
	it('draws a rectangle from its middle, and on a side with its third point across it', () => {
		expect(
			drawnGeometry(
				'rect',
				'center',
				[
					[2, 2],
					[3, 2.5]
				],
				plain
			)
		).toEqual({ kind: 'box', center: [2, 2], w: 2, h: 1, angle: 0 });
		const turned = drawnGeometry(
			'rect',
			'threePoints',
			[
				[0, 0],
				[3, 3],
				[0, 2]
			],
			plain
		);
		const round = (v: number) => +v.toFixed(6);
		expect(turned?.kind === 'box' && [turned.center.map(round), round(turned.w), round(turned.h), turned.angle]).toEqual([
			[1, 2],
			round(Math.hypot(3, 3)),
			round(Math.SQRT2),
			45
		]);
		expect(
			drawnGeometry(
				'rect',
				'threePoints',
				[
					[0, 0],
					[3, 3]
				],
				plain
			)
		).toEqual({ kind: 'side', from: [0, 0], to: [3, 3] });
	});

	it('draws a circle from its center, across a diameter and through three points', () => {
		expect(
			drawnGeometry(
				'round',
				'circleCenter',
				[
					[1, 1],
					[1, 3]
				],
				plain
			)
		).toMatchObject({ center: [1, 1], rx: 2, circle: true });
		expect(
			drawnGeometry(
				'round',
				'circleTwoPoints',
				[
					[0, 0],
					[4, 0]
				],
				plain
			)
		).toMatchObject({ center: [2, 0], rx: 2 });
		const through = drawnGeometry(
			'round',
			'circleThreePoints',
			[
				[-1, 0],
				[1, 0],
				[0, 1]
			],
			plain
		);
		expect(through?.kind === 'ellipse' && [through.center.map((v) => +v.toFixed(6)), +through.rx.toFixed(6)]).toEqual([[0, 0], 1]);
		// three points on a line are no circle
		expect(
			drawnGeometry(
				'round',
				'circleThreePoints',
				[
					[0, 0],
					[1, 0],
					[2, 0]
				],
				plain
			)?.kind
		).toBe('side');
	});
});
