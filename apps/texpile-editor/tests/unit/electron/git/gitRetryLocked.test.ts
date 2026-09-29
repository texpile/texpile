// A write that lost a race for .git/index.lock against another git (a terminal, another editor) is
// tried again rather than reported, as VS Code retries every operation: up to ten more times,
// waiting the attempt squared times 50 ms between them.
import { it, expect, vi, afterEach } from 'vitest';
import { retryLocked } from '../../../../../../electron/src/git/gitService';

const LOCKED = "fatal: Unable to create '/p/.git/index.lock': File exists.\n\nAnother git process seems to be running in this repository";

afterEach(() => {
	vi.useRealTimers();
});

it('tries again while the index is locked, waiting longer each time', async () => {
	vi.useFakeTimers();
	let calls = 0;
	const done = retryLocked(async () => {
		if (++calls <= 3) throw new Error(LOCKED);
		return 'done';
	});
	// 50 + 200 + 450 ms
	await vi.advanceTimersByTimeAsync(699);
	expect(calls).toBe(3);
	await vi.advanceTimersByTimeAsync(1);
	await expect(done).resolves.toBe('done');
	expect(calls).toBe(4);
});

it('gives up after ten retries', async () => {
	vi.useFakeTimers();
	let calls = 0;
	const failed = retryLocked(async () => {
		calls++;
		throw new Error(LOCKED);
	});
	const settled = expect(failed).rejects.toThrow('index.lock');
	await vi.advanceTimersByTimeAsync(20_000);
	await settled;
	expect(calls).toBe(11);
});

it('does not retry any other failure', async () => {
	let calls = 0;
	await expect(
		retryLocked(async () => {
			calls++;
			throw new Error('error: pathspec did not match any files');
		})
	).rejects.toThrow('pathspec');
	expect(calls).toBe(1);
});
