import { it, expect } from 'vitest';
import { applyUpdate, chatBlocks, toolTitle } from '$lib/ai/agentPanel/agentItems';
import type { ChatItem, SessionUpdate } from '$lib/ai/agentPanel/agentPanel.types';

function run(updates: SessionUpdate[]): ChatItem[] {
	return updates.reduce<ChatItem[]>((items, u) => applyUpdate(items, u), []);
}

it("merges a tool call's later updates into the one step, keeping what each did not say", () => {
	const items = run([
		{ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Edit main.tex', kind: 'edit', status: 'pending' },
		{ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'in_progress', locations: [{ path: '/p/main.tex' }] },
		{ sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' }
	]);
	expect(items).toEqual([
		{ kind: 'tool', id: 't1', title: 'Edit main.tex', toolKind: 'edit', status: 'completed', paths: ['/p/main.tex'] }
	]);
});

it('starts a new message after a step, and groups steps with nothing between them', () => {
	const chunk = (text: string): SessionUpdate => ({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } });
	const items = run([
		chunk('Reading '),
		chunk('it.'),
		{ sessionUpdate: 'tool_call', toolCallId: 'a', title: 'Read main.tex', kind: 'read', status: 'completed' },
		{ sessionUpdate: 'tool_call', toolCallId: 'b', title: 'Search', kind: 'search', status: 'completed' },
		chunk('Done.')
	]);
	expect(
		chatBlocks(items).map((b) => (b.kind === 'steps' ? b.tools.map((t) => t.id).join('+') : b.kind === 'agent' ? b.text : b.kind))
	).toEqual(['Reading it.', 'a+b', 'Done.']);
});

it("names a tool from Texpile's own MCP server in words, and leaves the agent's own tools as they are", () => {
	expect(toolTitle('mcp__texpile__get_editor_state')).toBe('Texpile: get editor state');
	expect(toolTitle('Edit main.tex')).toBe('Edit main.tex');
});
