import { describe, expect, it } from 'vitest';
import { Autoscroll, type ScrollTarget } from '$lib/editor/canvas/interaction/pointer/autoscroll';
import { autoscrollSpeed, p0Speed } from '$lib/editor/canvas/interaction/pointer/autoscrollSpeed';

const SCREEN = 791;

describe('autoscrollSpeed', () => {
	it('rises with overshoot and with the time held', () => {
		expect(autoscrollSpeed(-30, 0, SCREEN)).toBe(0);
		expect(autoscrollSpeed(-10, 0, SCREEN)).toBeGreaterThan(0);
		for (const held of [0, 500, 1500]) expect(autoscrollSpeed(40, held, SCREEN)).toBeGreaterThan(autoscrollSpeed(10, held, SCREEN));
		for (const over of [10, 40, 100]) expect(autoscrollSpeed(over, 800, SCREEN)).toBeGreaterThan(autoscrollSpeed(over, 100, SCREEN));
	});

	it('stays under one screen a second at 10 px and 0 ms and equals the DOM editor at 1.5 s', () => {
		expect(autoscrollSpeed(10, 0, SCREEN)).toBeLessThan(SCREEN);
		expect(autoscrollSpeed(60, 0, SCREEN)).toBeCloseTo(SCREEN, 0);
		for (const over of [10, 40, 100, 200]) expect(autoscrollSpeed(over, 1500, SCREEN)).toBeCloseTo(p0Speed(over), 5);
		expect(p0Speed(10)).toBeCloseTo(1870, 0);
		expect(p0Speed(100)).toBeCloseTo(7282, 0);
	});
});

function targetOf(): ScrollTarget & { top: number } {
	const target = {
		top: 0,
		axis: 'y' as const,
		rect: () => ({ start: 100, end: 100 + SCREEN }),
		screen: () => SCREEN,
		scrollBy(delta: number) {
			target.top += delta;
			return delta;
		}
	};
	return target;
}

describe('Autoscroll', () => {
	function drag(pastPx: number, ms: number) {
		const target = targetOf();
		let time = 0;
		const reruns: number[] = [];
		const queue: (() => void)[] = [];
		// the machine's replayed move reaches update() again
		const scroll: Autoscroll = new Autoscroll({
			targets: () => [target],
			rerun: (point) => (reruns.push(point.y), scroll.update(point)),
			now: () => time,
			frame: (callback) => (queue.push(() => callback(time)), queue.length),
			cancel: () => undefined
		});
		scroll.update({ x: 10, y: 100 + SCREEN + pastPx });
		while (time < ms) {
			time += 16;
			queue.splice(0).forEach((run) => run());
		}
		return { target, reruns, scroll, queued: queue.length };
	}

	it('holding 10 px past the edge for 1 s scrolls less than one pane height and runs the move again', () => {
		const { target, reruns, queued } = drag(10, 1000);
		expect(queued, 'one frame queued, never one per replayed move').toBe(1);
		expect(target.top).toBeGreaterThan(100);
		expect(target.top).toBeLessThan(SCREEN);
		expect(reruns.length).toBeGreaterThan(10);
	});

	it('100 px past for 3 s covers more than nine screens, and leaving the band stops it', () => {
		const { target, scroll } = drag(100, 3000);
		expect(target.top).toBeGreaterThan(9235);
		scroll.update({ x: 10, y: 300 });
		expect(scroll.running).toBe(false);
	});
});
