// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { idleSchedulerOf } from '$lib/editor/canvas/frame/idleScheduler';

describe('the idle scheduler', () => {
	it('gives a slice with a deadline where the engine has no requestIdleCallback, and cancels', async () => {
		expect(window.requestIdleCallback).toBeUndefined();
		const schedule = idleSchedulerOf(window);
		const remaining = await new Promise<number>((resolve) => schedule((slice) => resolve(slice.timeRemaining())));
		expect(remaining).toBeGreaterThan(0);
		expect(remaining).toBeLessThanOrEqual(5);
		let ran = false;
		const cancel = schedule(() => (ran = true));
		cancel();
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(ran).toBe(false);
	});
});
