import { expect, it, vi } from 'vitest';

vi.mock('$lib/files/service/fileService', () => ({ fileService: {} }));
vi.mock('$lib/buffers/textNow', () => ({ textNow: vi.fn() }));

import { DraftDispatcher } from '$lib/draft/draftDispatcher';
import type { TeleportOutcome } from '$lib/draft/draftTeleport.svelte';

function dispatcher(outcomes: TeleportOutcome[]) {
	const quiet = vi.fn();
	const teleportEdit = vi.fn(async () => outcomes.shift() ?? 'none');
	const d = new DraftDispatcher({
		getRoot: () => '/proj',
		getSource: () => '',
		getLoadedPath: () => null,
		isActive: () => true,
		flushSaves: async () => {},
		triggerFullCompile: () => {},
		triggerQuietCompile: quiet,
		getTarget: () => ({ teleportEdit })
	});
	return { d, quiet, teleportEdit };
}

// the pass after typing showed an agent's write; a second write the preview dropped took it along
it('keeps the pass after typing when a later edit shows nothing', async () => {
	vi.useFakeTimers();
	const { d, quiet } = dispatcher(['shown', 'none']);
	d.runFile('/proj/a.tex', 'one');
	await vi.advanceTimersByTimeAsync(100);
	d.runFile('/proj/b.tex', 'two');
	await vi.advanceTimersByTimeAsync(3000);
	expect(quiet).toHaveBeenCalledTimes(1);
	vi.useRealTimers();
});

// a teleport carries only .tex text: an open bibliography went 'outside' and never reached the preview
it('compiles for an open bibliography instead of teleporting it', async () => {
	vi.useFakeTimers();
	const { d, quiet, teleportEdit } = dispatcher([]);
	d.runFile('/proj/refs.bib', '@article{a}');
	await vi.advanceTimersByTimeAsync(1000);
	expect(teleportEdit).not.toHaveBeenCalled();
	expect(quiet).toHaveBeenCalledTimes(1);
	vi.useRealTimers();
});
