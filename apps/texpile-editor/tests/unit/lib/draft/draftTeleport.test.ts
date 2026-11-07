import { expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ draftTeleport: vi.fn() }));
vi.mock('$lib/workspace/fileSystem', () => ({ nativeBridge: () => native }));

import { DraftTeleport } from '$lib/draft/draftTeleport.svelte';

// a new compile per keystroke would start the running one over, and typing would keep a slow first compile from ending
it('sends an edit made during a compile again once the compile lands', async () => {
	let land = () => {};
	let compiling: Promise<void> | null = new Promise<void>((resolve) => (land = resolve));
	native.draftTeleport
		.mockResolvedValueOnce({ ok: false, reason: 'no-index', ms: 0 })
		.mockResolvedValueOnce({ ok: true, ms: 5, count: 1, srcFiles: [] });
	const teleport = new DraftTeleport({
		root: () => '/proj',
		mainFile: () => 'main.tex',
		applyPage: async () => {},
		landed: async () => {},
		compileInFlight: () => compiling,
		setStatus: () => {},
		emit: () => {}
	});
	const outcome = teleport.edit('main.tex', 'text');
	await new Promise((resolve) => setTimeout(resolve, 0));
	compiling = null;
	land();
	expect(await outcome).toBe('shown');
	expect(native.draftTeleport).toHaveBeenCalledTimes(2);
});
