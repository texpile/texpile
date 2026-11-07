import { beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
	passes: [] as ((r: unknown) => void)[],
	draftCompile: vi.fn(),
	draftStop: vi.fn(async () => ({ ok: true }))
}));
vi.mock('$lib/workspace/fileSystem', () => ({ nativeBridge: () => native }));

import { DraftCompiler } from '$lib/draft/draftCompiler.svelte';

let paused = false;
function compiler() {
	return new DraftCompiler({
		root: () => '/proj',
		mainFile: () => 'main.tex',
		applyCompiled: async () => {},
		afterCompile: () => {},
		paused: () => paused,
		hasPages: () => false,
		emit: () => {}
	});
}

beforeEach(() => {
	paused = false;
	native.passes = [];
	native.draftCompile.mockImplementation(() => new Promise((resolve) => native.passes.push(resolve)));
	native.draftStop.mockClear();
});

// a quiet pass after typing superseded the save's own, and the save copied draft.pdf before that pass wrote it
it('has Save PDF wait for the pass that superseded its own', async () => {
	const c = compiler();
	let landed: boolean | null = null;
	const save = c.compileToLand('save-pdf').then((l) => (landed = l));
	void c.compile('quiet:baseline');
	native.passes[0]({ ok: false, error: 'superseded', superseded: true });
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(landed).toBeNull();
	native.passes[1]({ ok: true });
	await save;
	expect(landed).toBe(true);
});

// every pass parks warm engines, and a pass run while paused left them running for the whole pause
it('stops the engine again after a pass while paused', async () => {
	paused = true;
	const c = compiler();
	const pass = c.compile('save-pdf');
	native.passes[0]({ ok: true });
	expect(await pass).toBe(true);
	expect(native.draftStop).toHaveBeenCalledTimes(1);
});

// nothing is on screen during a first compile, and it can run for a minute
it('says so when the first compile runs long', async () => {
	vi.useFakeTimers();
	const c = compiler();
	void c.compile('trigger:1');
	await vi.advanceTimersByTimeAsync(10_000);
	expect(c.slow).toBe(true);
	native.passes[0]({ ok: false, error: 'boom' });
	await vi.advanceTimersByTimeAsync(0);
	expect(c.slow).toBe(false);
	vi.useRealTimers();
});
