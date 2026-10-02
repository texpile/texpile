import { it, expect } from 'vitest';
import { AgentSession } from '$lib/ai/agentPanel/agentSession.svelte';
import { provideAgentHost } from '$lib/ai/agentPanel/agentHost.svelte';
import type { AcpBridge } from '$lib/ai/agentPanel/acpBridge';

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
