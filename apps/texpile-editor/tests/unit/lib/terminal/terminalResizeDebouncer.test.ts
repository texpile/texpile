// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import { TerminalResizeDebouncer } from '$lib/terminal/terminalResizeDebouncer';

function debouncer(bufferLines: number) {
	const calls: string[] = [];
	const xterm = { buffer: { normal: { length: bufferLines } }, element: document.createElement('div') } as unknown as Terminal;
	const d = new TerminalResizeDebouncer(
		() => true,
		() => xterm,
		(cols, rows) => calls.push(`both ${cols}x${rows}`),
		(cols) => calls.push(`cols ${cols}`),
		(rows) => calls.push(`rows ${rows}`)
	);
	return { d, calls };
}

it('rewraps a long buffer once the drag settles, but follows the height at once', () => {
	vi.useFakeTimers();
	const long = debouncer(500);
	long.d.resize(100, 30, false);
	long.d.resize(90, 28, false);
	expect(long.calls).toEqual(['rows 30', 'rows 28']);
	vi.advanceTimersByTime(100);
	expect(long.calls).toEqual(['rows 30', 'rows 28', 'cols 90']);

	const short = debouncer(50);
	short.d.resize(90, 28, false);
	expect(short.calls).toEqual(['both 90x28']);
	vi.useRealTimers();
});
