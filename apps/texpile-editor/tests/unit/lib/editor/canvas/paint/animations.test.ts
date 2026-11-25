import { describe, expect, it } from 'vitest';
import type { AnimationRef } from '$lib/editor/canvas';
import { animationFrameAt, easedProgress } from '$lib/editor/canvas/paint/animations';

function animation(name: string, durationMs: number, timing: string, iterations = Infinity): AnimationRef {
	return { name, durationMs, delayMs: 0, timing, iterations, direction: 'normal', fillMode: 'none', playState: 'running' };
}

describe('animations (6.5)', () => {
	it('blinks pm-caret-blink in two halves and says when it next flips', () => {
		const blink = animation('pm-caret-blink', 1060, 'step-end');
		expect([animationFrameAt(blink, 0).opacity, animationFrameAt(blink, 600).opacity, animationFrameAt(blink, 1100).opacity]).toEqual([
			1, 0, 1
		]);
		expect(animationFrameAt(blink, 100).nextMs).toBe(430);
	});

	it('holds the remote label for 70% of its linger, then fades it out and stops', () => {
		const linger = animation('pm-remote-label-linger', 3000, 'ease', 1);
		expect(animationFrameAt(linger, 1500).opacity).toBe(1);
		const fading = animationFrameAt(linger, 2700).opacity;
		expect(fading).toBeGreaterThan(0);
		expect(fading).toBeLessThan(1);
		expect(animationFrameAt(linger, 3100)).toEqual({ opacity: null, background: null, nextMs: null });
	});

	it('eases with the computed timing functions', () => {
		expect(easedProgress('linear', 0.3)).toBe(0.3);
		expect(easedProgress('steps(2, start)', 0.1)).toBe(0.5);
		expect(easedProgress('ease-out', 0.5)).toBeGreaterThan(0.5);
	});

	it('draws an unknown animation as its static frame', () => {
		expect(animationFrameAt(animation('nowhere', 500, 'ease'), 100, false)).toEqual({ opacity: null, background: null, nextMs: null });
	});
});
