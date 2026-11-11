import { it, expect, vi } from 'vitest';
import { idleRelease } from '$lib/idleRelease';

// a worker let go while a request is out would lose its answer
it('releases once nothing touched it for the time given, and waits again while busy', () => {
	vi.useFakeTimers();
	let busy = true;
	let released = 0;
	const touch = idleRelease(
		1000,
		() => busy,
		() => released++
	);
	touch();
	vi.advanceTimersByTime(900);
	touch();
	vi.advanceTimersByTime(900);
	expect(released).toBe(0);
	vi.advanceTimersByTime(2000);
	expect(released).toBe(0);
	busy = false;
	vi.advanceTimersByTime(1000);
	expect(released).toBe(1);
	vi.useRealTimers();
});
