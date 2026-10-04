// The agent panel's view of an ACP conversation. Shapes mirror what electron/src/ai/acp sends, cut down
// to what the panel draws

export type PanelAgent = 'codex' | 'claude' | 'opencode' | 'copilot' | 'gemini' | 'custom';
export type PresetPanelAgent = Exclude<PanelAgent, 'custom'>;

export type AgentState = 'idle' | 'starting' | 'ready' | 'working' | 'signed-out' | 'missing' | 'unset' | 'no-folder' | 'failed';

export type ToolKind = 'read' | 'edit' | 'delete' | 'move' | 'search' | 'execute' | 'think' | 'fetch' | 'switch_mode' | 'other';
export type ToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type ToolItem = { kind: 'tool'; id: string; title: string; toolKind: ToolKind; status: ToolStatus; paths: string[] };
export type PlanEntry = { content: string; status: 'pending' | 'in_progress' | 'completed' };

export type ChangedFile = {
	/** absolute */
	path: string;
	change: 'modified' | 'added' | 'deleted';
	/** where the file as it was before the turn is kept (agentBefore.ts); null for a file the turn added */
	ref: string | null;
};

/** lines counted from 1, and the text they hold as the file has it */
export type SelectedLines = { first: number; last: number; text: string };
/** what goes with a message: the open file, or the lines of it the reader selected */
export type Attached = { path: string; lines: SelectedLines | null };
/** an image pasted, dropped or picked, as the base64 of its bytes; size is null where it could not be read */
export type PastedImage = { name: string; mimeType: string; base64: string; size: { width: number; height: number } | null };

export type ChatItem =
	| { kind: 'user'; id: string; text: string; attached: Attached | null; images?: PastedImage[] }
	| { kind: 'agent'; id: string; text: string }
	| { kind: 'thought'; id: string; text: string }
	| ToolItem
	| { kind: 'plan'; id: string; entries: PlanEntry[] }
	| { kind: 'changes'; id: string; files: ChangedFile[] }
	| { kind: 'error'; id: string; text: string };

export type PermissionAsk = { id: string; title: string; options: { optionId: string; name: string; kind: string }[] };

/** a slash command the agent offers; `hint` names what to type after it, when it takes anything */
export type AgentCommand = { name: string; description: string; hint: string | null };

export type ConfigChoice = { value: string; name: string; description?: string };
export type ConfigOption = {
	id: string;
	name: string;
	description?: string;
	category: string | null;
	currentValue: string;
	choices: ConfigChoice[];
};

/** session/update notifications as they arrive; only the fields the panel reads */
export type SessionUpdate = { sessionUpdate: string } & Record<string, unknown>;

export type AcpEvent =
	| {
			type: 'state';
			state: 'starting' | 'ready' | 'working' | 'signed-out' | 'failed';
			detail?: string;
			title?: string;
			configOptions?: unknown[];
			chat?: string;
			history?: boolean;
			takesSelection?: boolean;
			takesImages?: boolean;
	  }
	| { type: 'update'; update: SessionUpdate }
	| { type: 'permission'; id: string; toolCall: { title?: string | null }; options: PermissionAsk['options'] }
	| { type: 'permission-done'; id: string };

/** a past chat as the agent lists it */
export type ChatInfo = { id: string; title: string | null; updatedAt: string | null };

export type TurnChange = { path: string; kind: ChangedFile['change']; before: string | null };
export type PromptResult = { ok: boolean; stopReason?: string; error?: string; changes: TurnChange[] };
export type StartResult = { ok: true; agent: PanelAgent } | { ok: false; reason: 'no-folder' | 'unset' | 'missing'; program?: string };
