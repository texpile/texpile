// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColumnWidth } from '$lib/resizing/columnWidth';
import { beginDividerDrag } from '$lib/resizing/edgeDrag';

let now = 0;
let frames: FrameRequestCallback[] = [];
function runFrames(): void {
	const due = frames;
	frames = [];
	for (const frame of due) frame(now);
}

function columnOf(width: number) {
	const column = { clientWidth: width } as { clientWidth: number };
	const hooks = { breakNow: vi.fn(), hold: vi.fn(), rest: vi.fn() };
	const tracked = new ColumnWidth(column as HTMLElement, hooks);
	// the first change is the editor finding its place, which the pane breaks for
	tracked.changed();
	tracked.breaking();
	hooks.breakNow.mockClear();
	return { column, hooks, tracked };
}

beforeEach(() => {
	now = 1000;
	frames = [];
	vi.useFakeTimers();
	vi.spyOn(performance, 'now').mockImplementation(() => now);
	vi.stubGlobal(
		'ResizeObserver',
		class {
			observe() {}
			disconnect() {}
		}
	);
	vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
	vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('ColumnWidth', () => {
	it('holds from the first step of a divider drag and rests on the release', () => {
		const { column, hooks, tracked } = columnOf(600);
		const endDrag = beginDividerDrag();
		column.clientWidth = 590;
		tracked.changed(true);
		runFrames();
		vi.advanceTimersByTime(1000);
		expect(hooks.breakNow).not.toHaveBeenCalled();
		expect(hooks.hold).toHaveBeenCalledTimes(1);
		expect(hooks.rest).not.toHaveBeenCalled();
		endDrag();
		expect(hooks.rest).toHaveBeenCalledTimes(1);
	});

	it('counts a step that comes once a slow break is drawn as moving', () => {
		const { column, hooks, tracked } = columnOf(600);
		column.clientWidth = 590;
		tracked.changed(true);
		expect(hooks.breakNow).toHaveBeenCalledTimes(1);
		tracked.breaking();
		tracked.broken();
		// the break's frame took this long to style, lay out and paint
		now += 400;
		runFrames();
		now += 5;
		column.clientWidth = 580;
		tracked.changed(true);
		expect(hooks.breakNow).toHaveBeenCalledTimes(1);
		expect(tracked.moving).toBe(true);
	});
});
