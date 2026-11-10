// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
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

it("keeps the agent's last count of the context, and forgets it with the chat", async () => {
	const bridge = {
		start: async () => ({ ok: true, agent: 'claude' }),
		openChat: async () => ({ ok: true }),
		onEvent: () => () => {}
	} as unknown as AcpBridge;
	const session = new AgentSession(() => bridge);
	await session.start('/p');
	session.receive({ type: 'state', state: 'ready' });
	expect(session.usage).toBeNull();
	session.receive({ type: 'update', update: { sessionUpdate: 'usage_update', used: 30_000, size: 200_000 } });
	session.receive({ type: 'update', update: { sessionUpdate: 'usage_update', used: 31_000, size: 0 } });
	expect(session.usage).toEqual({ used: 30_000, size: 200_000 });
	expect(session.items).toEqual([]);
	await session.openChat('older');
	expect(session.usage).toBeNull();
});

it('sends a message written during a turn once the turn ends, and gives it back on Stop instead', async () => {
	const prompts: unknown[] = [];
	let finish = () => {};
	const bridge = {
		start: async () => ({ ok: true, agent: 'claude' }),
		prompt: (blocks: unknown[]) => {
			prompts.push(blocks);
			return new Promise((resolve) => (finish = () => resolve({ ok: true, stopReason: 'end_turn', changes: [] })));
		},
		cancel: () => finish(),
		onEvent: () => () => {}
	} as unknown as AcpBridge;
	const release = provideAgentHost({
		openCompareTab: () => {},
		openFile: () => {},
		writeText: async () => {},
		flushPendingSave: async () => {},
		selection: () => null
	});
	const session = new AgentSession(() => bridge);
	await session.start('/p');
	session.receive({ type: 'state', state: 'ready' });
	const first = session.send('one', null);
	await Promise.resolve();
	await session.send('two', null);
	expect(session.queued.map((q) => q.text)).toEqual(['two']);
	finish();
	await vi.waitFor(() => expect(prompts).toHaveLength(2));
	expect(prompts[1]).toEqual([{ type: 'text', text: 'two' }]);
	expect(session.queued).toEqual([]);

	await session.send('three', null);
	expect(session.cancel().map((q) => q.text)).toEqual(['three']);
	await first;
	expect(prompts).toHaveLength(2);
	release();
});

it('sends a message written after Stop, while the stopped turn is still ending', async () => {
	const prompts: unknown[] = [];
	let finish = () => {};
	const bridge = {
		start: async () => ({ ok: true, agent: 'claude' }),
		prompt: (blocks: unknown[]) => {
			prompts.push(blocks);
			return new Promise((resolve) => (finish = () => resolve({ ok: true, stopReason: 'cancelled', changes: [] })));
		},
		cancel: () => {},
		onEvent: () => () => {}
	} as unknown as AcpBridge;
	const release = provideAgentHost({
		openCompareTab: () => {},
		openFile: () => {},
		writeText: async () => {},
		flushPendingSave: async () => {},
		selection: () => null
	});
	const session = new AgentSession(() => bridge);
	await session.start('/p');
	session.receive({ type: 'state', state: 'ready' });
	const first = session.send('one', null);
	await vi.waitFor(() => expect(prompts).toHaveLength(1));
	session.cancel();
	await session.send('rewritten', null);
	finish();
	await vi.waitFor(() => expect(prompts).toHaveLength(2));
	expect(prompts[1]).toEqual([{ type: 'text', text: 'rewritten' }]);
	finish();
	await first;
	release();
});
