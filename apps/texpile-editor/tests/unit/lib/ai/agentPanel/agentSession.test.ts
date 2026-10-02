// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { AgentSession, agentSession } from '$lib/ai/agentPanel/agentSession.svelte';
import { provideAgentHost } from '$lib/ai/agentPanel/agentHost.svelte';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import type { AcpBridge } from '$lib/ai/agentPanel/acpBridge';
import Harness from './AgentSessionHarness.svelte';

it('sends nothing when Stop comes while the save before the turn is still running', async () => {
	const prompts: unknown[] = [];
	const bridge = {
		start: async () => ({ ok: true, agent: 'claude' }),
		prompt: async (blocks: unknown[]) => {
			prompts.push(blocks);
			return { ok: true, stopReason: 'end_turn', changes: [] };
		},
		cancel: () => {},
		onEvent: () => () => {}
	} as unknown as AcpBridge;
	let saved = () => {};
	const release = provideAgentHost({
		openCompareTab: () => {},
		openFile: () => {},
		writeText: async () => {},
		flushPendingSave: () => new Promise<void>((resolve) => (saved = resolve)),
		selection: () => null
	});
	const session = new AgentSession(() => bridge);
	await session.start('/p');
	session.receive({ type: 'state', state: 'ready' });
	const sent = session.send('rewrite the intro', null);
	session.cancel();
	saved();
	await sent;
	release();
	expect(prompts).toEqual([]);
	expect(session.state).toBe('ready');
});

it('stops the agent when Close Folder takes the workspace view down with its folder', async () => {
	const closed: string[] = [];
	(globalThis as { texpileAcp?: unknown }).texpileAcp = {
		start: async () => ({ ok: true, agent: 'claude' }),
		close: () => closed.push('/p'),
		onEvent: () => () => {}
	};
	workspaceRoot.current = '/p';
	await agentSession.start('/p');
	const app = mount(Harness, { target: document.body });
	flushSync();
	// the folder goes and the view with it, before the view's effects run again
	workspaceRoot.current = null;
	unmount(app);
	expect(closed).toEqual(['/p']);
});
