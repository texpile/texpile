// @vitest-environment jsdom
import { it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({ calls: [] as string[], confirmed: true }));
const calls = state.calls;

vi.mock('$lib/collab/hostStore.svelte', () => ({ collabHost: { active: true, end: async () => void state.calls.push('end') } }));
vi.mock('$lib/modals/confirm.svelte', () => ({ confirmAsk: async () => state.confirmed }));
vi.mock('$lib/workspace/fileSystem', () => ({ nativeBridge: () => ({ reloadWorkspace: () => state.calls.push('reload') }) }));

import { reloadWorkspace } from '$lib/workspace/commands/fileCommands';

beforeEach(() => {
	calls.length = 0;
	state.confirmed = true;
});

it('ends the shared session before the reload, so guests see it end', async () => {
	await reloadWorkspace();
	expect(calls).toEqual(['end', 'reload']);
});

it('leaves the session alone when the reload is declined', async () => {
	state.confirmed = false;
	await reloadWorkspace();
	expect(calls).toEqual([]);
});
