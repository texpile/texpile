// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RailGeometry } from '$lib/comments/rail/railGeometry.svelte';

describe('the comment margin geometry', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('measures beside a framed editor at once and in the frame that moved its text', () => {
		vi.stubGlobal(
			'ResizeObserver',
			class {
				observe() {}
				disconnect() {}
			}
		);
		const geometry = new RailGeometry();
		let moved = () => {};
		let measured = 0;
		const stop = geometry.observe({
			changes: (callback) => {
				moved = callback;
				return () => {};
			},
			framed: true,
			resize: document.body,
			measure: () => new Map([['thread', ++measured]])
		});
		expect(geometry.anchors.get('thread')).toBe(1);
		moved();
		expect(geometry.anchors.get('thread')).toBe(2);
		stop();
	});
});
