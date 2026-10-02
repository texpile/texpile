// session/update notifications folded into the conversation the panel draws. Always a new list: the
// panel reads it as $state, and an edited one goes stale silently
import type { AgentCommand, ChatItem, ConfigOption, PlanEntry, SessionUpdate, ToolItem, ToolKind, ToolStatus } from './agentPanel.types';

const TOOL_KINDS = new Set(['read', 'edit', 'delete', 'move', 'search', 'execute', 'think', 'fetch', 'switch_mode', 'other']);
const TOOL_STATUSES = new Set(['pending', 'in_progress', 'completed', 'failed']);

let seq = 0;
export function itemId(): string {
	return `i${++seq}`;
}

function text(content: unknown): string {
	const c = content as { type?: unknown; text?: unknown } | null;
	return c?.type === 'text' && typeof c.text === 'string' ? c.text : '';
}

function appendChunk(items: ChatItem[], kind: 'agent' | 'thought' | 'user', chunk: string): ChatItem[] {
	if (!chunk) return items;
	const last = items.at(-1);
	if (last?.kind === kind) return [...items.slice(0, -1), { ...last, text: last.text + chunk }];
	return [...items, kind === 'user' ? { kind, id: itemId(), text: chunk, attached: null } : { kind, id: itemId(), text: chunk }];
}

function paths(locations: unknown): string[] | undefined {
	if (!Array.isArray(locations)) return undefined;
	return locations.map((l) => (l as { path?: unknown })?.path).filter((p): p is string => typeof p === 'string');
}

/** a tool from an MCP server reaches the panel as `mcp__server__tool_name`; shown as `Server: tool name` */
export function toolTitle(raw: string): string {
	const mcp = /^mcp__(.+?)__(.+)$/.exec(raw);
	if (!mcp) return raw;
	return `${mcp[1].charAt(0).toUpperCase()}${mcp[1].slice(1)}: ${mcp[2].replaceAll('_', ' ')}`;
}

function toolFields(u: SessionUpdate): Partial<ToolItem> {
	const out: Partial<ToolItem> = {};
	if (typeof u.title === 'string') out.title = toolTitle(u.title);
	if (TOOL_KINDS.has(u.kind as string)) out.toolKind = u.kind as ToolKind;
	if (TOOL_STATUSES.has(u.status as string)) out.status = u.status as ToolStatus;
	const p = paths(u.locations);
	if (p) out.paths = p;
	return out;
}

function upsertTool(items: ChatItem[], u: SessionUpdate): ChatItem[] {
	const id = typeof u.toolCallId === 'string' ? u.toolCallId : null;
	if (!id) return items;
	const at = items.findIndex((i) => i.kind === 'tool' && i.id === id);
	if (at < 0) {
		const fresh: ToolItem = { kind: 'tool', id, title: '', toolKind: 'other', status: 'pending', paths: [], ...toolFields(u) };
		return [...items, fresh];
	}
	return items.map((i, n) => (n === at ? { ...(i as ToolItem), ...toolFields(u) } : i));
}

function planEntries(entries: unknown): PlanEntry[] {
	if (!Array.isArray(entries)) return [];
	return entries
		.map((e) => e as { content?: unknown; status?: unknown })
		.filter((e) => typeof e.content === 'string')
		.map((e) => ({ content: e.content as string, status: e.status === 'completed' || e.status === 'in_progress' ? e.status : 'pending' }));
}

/** one plan per turn: the agent sends the whole list each time it changes */
function replacePlan(items: ChatItem[], entries: PlanEntry[]): ChatItem[] {
	const lastUser = items.findLastIndex((i) => i.kind === 'user');
	const at = items.findLastIndex((i) => i.kind === 'plan');
	if (at > lastUser) return items.map((i, n) => (n === at ? { ...i, entries } : i)) as ChatItem[];
	return [...items, { kind: 'plan', id: itemId(), entries }];
}

export function applyUpdate(items: ChatItem[], u: SessionUpdate): ChatItem[] {
	switch (u.sessionUpdate) {
		// only in a chat the agent replays: a live turn's message is the one the panel sent
		case 'user_message_chunk':
			return appendChunk(items, 'user', text(u.content));
		case 'agent_message_chunk':
			return appendChunk(items, 'agent', text(u.content));
		case 'agent_thought_chunk':
			return appendChunk(items, 'thought', text(u.content));
		case 'tool_call':
		case 'tool_call_update':
			return upsertTool(items, u);
		case 'plan':
			return replacePlan(items, planEntries(u.entries));
		default:
			return items;
	}
}

export type ChatBlock = { kind: 'steps'; id: string; tools: ToolItem[] } | Exclude<ChatItem, ToolItem>;

/** a run of tool calls with nothing between them reads as one group of steps */
export function chatBlocks(items: ChatItem[]): ChatBlock[] {
	const out: ChatBlock[] = [];
	for (const item of items) {
		const last = out.at(-1);
		if (item.kind !== 'tool') out.push(item);
		else if (last?.kind === 'steps') out[out.length - 1] = { ...last, tools: [...last.tools, item] };
		else out.push({ kind: 'steps', id: `s${item.id}`, tools: [item] });
	}
	return out;
}

/** the agent's slash commands, as available_commands_update lists them */
export function availableCommands(raw: unknown): AgentCommand[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((c) => c as { name?: unknown; description?: unknown; input?: { hint?: unknown } | null })
		.filter((c) => typeof c.name === 'string' && c.name)
		.map((c) => ({
			name: (c.name as string).replace(/^\//, ''),
			description: typeof c.description === 'string' ? c.description : '',
			hint: typeof c.input?.hint === 'string' && c.input.hint ? c.input.hint : null
		}));
}

/** a choice, or a group of them as `options` */
type RawChoice = { value?: unknown; name?: unknown; description?: unknown; options?: unknown };

/** select options only, groups flattened: the panel offers each as one dropdown */
export function configOptions(raw: unknown): ConfigOption[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.map(
			(o) =>
				o as {
					id?: unknown;
					name?: unknown;
					description?: unknown;
					type?: unknown;
					category?: unknown;
					currentValue?: unknown;
					options?: unknown;
				}
		)
		.filter((o) => o.type === 'select' && typeof o.id === 'string' && typeof o.currentValue === 'string' && Array.isArray(o.options))
		.map((o) => ({
			id: o.id as string,
			name: typeof o.name === 'string' ? o.name : (o.id as string),
			...(typeof o.description === 'string' && o.description ? { description: o.description } : {}),
			category: typeof o.category === 'string' ? o.category : null,
			currentValue: o.currentValue as string,
			choices: (o.options as RawChoice[])
				.flatMap((c) => (Array.isArray(c.options) ? (c.options as RawChoice[]) : [c]))
				.filter((c) => typeof c.value === 'string')
				.map((c) => ({
					value: c.value as string,
					name: typeof c.name === 'string' ? c.name : (c.value as string),
					...(typeof c.description === 'string' && c.description ? { description: c.description } : {})
				}))
		}));
}
