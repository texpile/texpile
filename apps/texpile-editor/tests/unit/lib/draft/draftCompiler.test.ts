import { beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
	passes: [] as ((r: unknown) => void)[],
	draftCompile: vi.fn(),
	draftTypeset: vi.fn(async () => ({ ok: true })),
	draftStop: vi.fn(async () => ({ ok: true }))
}));
vi.mock('$lib/workspace/fileSystem', () => ({ nativeBridge: () => native }));

import { DraftCompiler } from '$lib/draft/draftCompiler.svelte';

let paused = false;
function compiler() {
	return new DraftCompiler({
		root: () => '/proj',
		mainFile: () => 'main.tex',
		paperColW: () => 0,
		patchInFlight: () => false,
		applyCompiled: async () => {},
		afterCompile: () => {},
		paused: () => paused,
		emit: () => {}
	});
}

beforeEach(() => {
	paused = false;
	native.passes = [];
	native.draftCompile.mockImplementation(() => new Promise((resolve) => native.passes.push(resolve)));
	native.draftTypeset.mockClear();
	native.draftStop.mockClear();
});

// a patch's reconcile pass superseded the save's own, and the save copied draft.pdf before that pass wrote it
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

// every pass parks a warm lualatex, and a pass run while paused left it running for the whole pause
it('stops the engine again after a pass while paused', async () => {
	paused = true;
	const c = compiler();
	const pass = c.compile('save-pdf');
	native.passes[0]({ ok: true });
	expect(await pass).toBe(true);
	expect(native.draftStop).toHaveBeenCalledTimes(1);
	expect(native.draftTypeset).not.toHaveBeenCalled();
});
