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
		moveSourceLines: () => {},
		compileInFlight: () => compiling,
		setStatus: () => {},
		refused: () => {},
		emit: () => {}
	});
	const outcome = teleport.edit('main.tex', 'text');
	await new Promise((resolve) => setTimeout(resolve, 0));
	compiling = null;
	land();
	expect(await outcome).toBe('shown');
	expect(native.draftTeleport).toHaveBeenCalledTimes(2);
});

// an agent writes once: an edit a landing compile cut off would otherwise never reach the screen
it('sends an edit again when a compile replaced the index under it, unless a newer one followed', async () => {
	native.draftTeleport.mockReset();
	let land: (r: unknown) => void = () => undefined;
	native.draftTeleport
		.mockReturnValueOnce(new Promise((resolve) => (land = resolve)))
		.mockResolvedValueOnce({ ok: false, reason: 'replaced', ms: 0 })
		.mockResolvedValueOnce({ ok: true, ms: 5, count: 1, srcFiles: [] });
	const teleport = new DraftTeleport({
		root: () => '/proj',
		mainFile: () => 'main.tex',
		applyPage: async () => {},
		landed: async () => {},
		moveSourceLines: () => {},
		compileInFlight: () => null,
		setStatus: () => {},
		refused: () => {},
		emit: () => {}
	});
	const older = teleport.edit('main.tex', 'one');
	const newer = teleport.edit('main.tex', 'two');
	land({ ok: false, reason: 'replaced', ms: 0 });
	expect(await older).toBe('none');
	expect(await newer).toBe('shown');
	expect(native.draftTeleport).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'two' }));
});

// the compile that shows a refused edit takes the preview to it
it('says when an edit waits for a full compile', async () => {
	native.draftTeleport.mockReset();
	native.draftTeleport.mockResolvedValueOnce({ ok: false, reason: 'preamble', ms: 0 });
	const refused = vi.fn();
	const teleport = new DraftTeleport({
		root: () => '/proj',
		mainFile: () => 'main.tex',
		applyPage: async () => {},
		landed: async () => {},
		moveSourceLines: () => {},
		compileInFlight: () => null,
		setStatus: () => {},
		refused,
		emit: () => {}
	});
	expect(await teleport.edit('main.tex', 'text')).toBe('compile');
	expect(refused).toHaveBeenCalledOnce();
});
