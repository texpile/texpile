// The window's conversation with its agent, kept here rather than in the panel: the dock unmounts a tab
// it is not showing, and the conversation has to outlive that
import { acpBridge, type AcpBridge } from './acpBridge';
import { applyUpdate, availableCommands, configOptions, itemId, toolTitle } from './agentItems';
import { keepBefore } from './changes/agentBefore';
import { agentHost } from './agentHost.svelte';
import { settings, updateSettingsSettled } from '$lib/settings';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { agentUnavailable } from './agentAvailability';
import { attachedBlocks } from './attach/attached';
import type {
	AcpEvent,
	AgentCommand,
	AgentState,
	Attached,
	ChatInfo,
	ChatItem,
	ConfigOption,
	PanelAgent,
	PermissionAsk
} from './agentPanel.types';

export class AgentSession {
	state = $state<AgentState>('idle');
	/** why it failed, in the agent's words */
	detail = $state('');
	/** the program a missing agent was looked for as */
	program = $state('');
	/** what the agent calls itself, which names a custom agent better than Custom agent does */
	name = $state('');
	/** the agent main started, which a choice made since in another window does not change */
	agent = $state<PanelAgent | null>(null);
	items = $state<ChatItem[]>([]);
	asks = $state<PermissionAsk[]>([]);
	config = $state<ConfigOption[]>([]);
	/** the slash commands the agent offers, for the box's / menu */
	commands = $state<AgentCommand[]>([]);
	/** the agent takes a selection's text with a message, not only a link to its file */
	takesSelection = $state(false);
	/** the folder it runs in; another folder in this window starts a new conversation */
	root = $state<string | null>(null);
	/** the agent keeps its chats, so earlier ones can be opened again; Texpile keeps none itself */
	history = $state(false);
	chats = $state<ChatInfo[]>([]);
	/** the chat open now, as the agent names it */
	chat = $state<string | null>(null);
	private unsubscribe: (() => void) | null = null;
	/** bumped by each start and close, so what a turn of an earlier conversation brings back goes nowhere */
	private conversation = 0;
	/** while the agent replays a chat; a live turn's own message is the one this window sent */
	private replaying = false;

	constructor(private bridge: () => AcpBridge | undefined = acpBridge) {}

	async start(root: string): Promise<void> {
		const bridge = this.bridge();
		if (!bridge) return;
		this.unsubscribe ??= bridge.onEvent((e) => this.receive(e));
		const conversation = ++this.conversation;
		this.root = root;
		this.items = [];
		this.asks = [];
		this.config = [];
		this.commands = [];
		this.takesSelection = false;
		this.detail = '';
		this.name = '';
		this.agent = null;
		this.history = false;
		this.chats = [];
		this.chat = null;
		this.state = 'starting';
		const r = await bridge.start();
		if (conversation !== this.conversation) return;
		if (r.ok) this.agent = r.agent;
		else {
			this.state = r.reason;
			this.program = r.program ?? '';
		}
	}

	receive(e: AcpEvent): void {
		if (e.type === 'state') {
			this.state = e.state;
			this.detail = e.detail ?? '';
			if (e.title) this.name = e.title;
			if (e.configOptions) this.config = configOptions(e.configOptions);
			if (e.chat) this.chat = e.chat;
			if (e.history !== undefined) this.history = e.history;
			if (e.takesSelection !== undefined) this.takesSelection = e.takesSelection;
			if (e.state === 'failed') this.asks = [];
			// after a start, a turn or a chat opened: each may have added one to the list
			if (e.state === 'ready' && this.history) void this.listChats();
		} else if (e.type === 'update') {
			if (e.update.sessionUpdate === 'config_option_update') this.config = configOptions(e.update.configOptions);
			else if (e.update.sessionUpdate === 'available_commands_update') this.commands = availableCommands(e.update.availableCommands);
			else if (e.update.sessionUpdate !== 'user_message_chunk' || this.replaying) this.items = applyUpdate(this.items, e.update);
		} else if (e.type === 'permission') {
			this.asks = [...this.asks, { id: e.id, title: toolTitle(e.toolCall?.title ?? ''), options: e.options }];
		} else {
			this.asks = this.asks.filter((a) => a.id !== e.id);
		}
	}

	async send(text: string, attached: Attached | null): Promise<void> {
		const bridge = this.bridge();
		if (!bridge || this.state !== 'ready' || !text.trim()) return;
		const conversation = this.conversation;
		// at once: a message sent while the save and main's look at the folder run would start a second turn
		this.state = 'working';
		await agentHost.current?.flushPendingSave();
		if (conversation !== this.conversation) return;
		this.items = [...this.items, { kind: 'user', id: itemId(), text, attached }];
		const r = await bridge.prompt([{ type: 'text', text }, ...attachedBlocks(attached)]);
		if (conversation !== this.conversation) return;
		// read again: events moved it on while the turn ran. Main moves it on before it answers, so one still
		// working is a turn main never began
		if (this.stateNow() === 'working') this.state = 'ready';
		const files = keepBefore(r.changes ?? []);
		const after: ChatItem[] = [];
		if (!r.ok && r.error && this.stateNow() !== 'signed-out') after.push({ kind: 'error', id: itemId(), text: r.error });
		if (files.length) after.push({ kind: 'changes', id: itemId(), files });
		if (after.length) this.items = [...this.items, ...after];
	}

	private stateNow(): AgentState {
		return this.state;
	}

	cancel(): void {
		this.bridge()?.cancel();
	}

	answer(id: string, optionId: string | null): void {
		this.bridge()?.answer(id, optionId);
	}

	setConfig(id: string, value: string): void {
		this.config = this.config.map((o) => (o.id === id ? { ...o, currentValue: value } : o));
		void this.bridge()?.setConfig(id, value);
	}

	async listChats(): Promise<void> {
		const bridge = this.bridge();
		if (!bridge) return;
		const conversation = this.conversation;
		const chats = await bridge.chats();
		if (conversation === this.conversation) this.chats = chats;
	}

	/** an earlier chat, which the agent replays into the panel */
	async openChat(id: string): Promise<void> {
		const bridge = this.bridge();
		if (!bridge || this.state !== 'ready' || id === this.chat) return;
		const conversation = ++this.conversation;
		this.items = [];
		this.asks = [];
		this.replaying = true;
		const r = await bridge.openChat(id).finally(() => (this.replaying = false));
		if (conversation !== this.conversation) return;
		if (!r.ok && r.error) this.items = [...this.items, { kind: 'error', id: itemId(), text: r.error }];
	}

	close(): void {
		this.bridge()?.close();
		this.conversation += 1;
		this.root = null;
		this.agent = null;
		this.state = 'idle';
	}
}

export const agentSession = new AgentSession();

/** the conversation for this folder, starting one if there is none. With no agent chosen yet main starts
 *  nothing and the tab asks for one: the reader picks the agent, Texpile never picks it for them */
export async function openAgentSession(root: string): Promise<void> {
	if (agentSession.root === root && agentSession.state !== 'idle') return;
	await agentSession.start(root);
}

/** a conversation that has to go: the tab turned off, the agent unable to run here, or its folder no longer open */
export function agentSessionStale(): boolean {
	const root = agentSession.root;
	return !!root && (settings.current.agentPanel === 'off' || agentUnavailable() !== null || root !== workspaceRoot.current);
}

/** the agent the tab names: the one running, else the one chosen */
export function shownAgent(): PanelAgent | '' | 'off' {
	return agentSession.agent ?? settings.current.agentPanel ?? '';
}

/** another agent, or a fresh conversation with the same one */
export async function restartAgentSession(agent?: PanelAgent): Promise<void> {
	const root = agentSession.root;
	if (agent && agent !== settings.current.agentPanel) await updateSettingsSettled({ agentPanel: agent });
	if (root) await agentSession.start(root);
}
