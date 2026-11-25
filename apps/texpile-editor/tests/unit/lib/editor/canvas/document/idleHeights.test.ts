import { describe, expect, it } from 'vitest';
import { IdleHeights, type IdleHeightsHost } from '$lib/editor/canvas/document/idleHeights';
import type { IdleScheduler, IdleTask } from '$lib/editor/canvas/frame/idleScheduler';

/** 200 estimated blocks, 100 to 110 on screen and laid out, `ahead` either side within a viewport; each slice has room
 * for `perSlice` blocks */
function idleSetup(perSlice: number, paused = () => false, ahead = 0, typing = () => false) {
	const estimated = new Set(Array.from({ length: 200 }, (_, i) => i));
	const laid = new Set(Array.from({ length: 11 }, (_, i) => 100 + i));
	const order: number[] = [];
	const prepared: number[] = [];
	let pending: IdleTask | null = null;
	const schedule: IdleScheduler = (task) => {
		pending = task;
		return () => (pending = null);
	};
	const host: IdleHeightsHost = {
		count: 200,
		get estimatedCount() {
			return estimated.size;
		},
		estimated: (i) => estimated.has(i),
		measure(i) {
			order.push(i);
			estimated.delete(i);
		},
		visible: () => ({ first: 100, last: 110 }),
		ahead: () => ({ first: 100 - ahead, last: 110 + ahead }),
		laidOut: (i) => laid.has(i),
		prepare(i) {
			prepared.push(i);
			laid.add(i);
			estimated.delete(i);
		},
		measured() {},
		paused,
		typing
	};
	const idle = new IdleHeights(host, schedule);
	function runSlice(): void {
		const task = pending;
		pending = null;
		let left = perSlice;
		task?.({ timeRemaining: () => (left-- > 0 ? 1 : 0) });
	}
	return { idle, order, prepared, runSlice, pending: () => pending };
}

describe('idle heights', () => {
	it('measure the blocks nearest the viewport first, then the rest from the top, a few per slice', () => {
		const { idle, order, runSlice } = idleSetup(4);
		idle.start();
		runSlice();
		expect(order).toEqual([110, 100, 111, 99]);
		for (let i = 0; i < 60; i++) runSlice();
		// 50 blocks either side of the viewport, then the top
		expect(order.slice(100, 106)).toEqual([160, 50, 0, 1, 2, 3]);
		expect(order).toHaveLength(200);
	});

	it('lay out and keep the blocks a scroll reaches next before measuring any height', () => {
		const { idle, order, prepared, runSlice } = idleSetup(4, () => false, 3);
		idle.start();
		runSlice();
		runSlice();
		expect(prepared).toEqual([111, 99, 112, 98, 113, 97]);
		expect(order).toEqual([110, 100]);
	});

	it('measure no block above the viewport while keys come in, and all of them once typing stops', () => {
		let typing = true;
		const { idle, order, runSlice } = idleSetup(
			4,
			() => false,
			0,
			() => typing
		);
		idle.start();
		for (let i = 0; i < 60; i++) runSlice();
		expect(order.filter((i) => i < 100)).toEqual([]);
		expect(order.at(-1)).toBe(199);
		typing = false;
		idle.start();
		for (let i = 0; i < 60; i++) runSlice();
		expect(order).toHaveLength(200);
	});

	it('measure nothing at a width about to change', () => {
		const { idle, order, runSlice } = idleSetup(4, () => true);
		idle.start();
		runSlice();
		expect(order).toEqual([]);
	});
});
