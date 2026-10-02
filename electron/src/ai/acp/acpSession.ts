// One window's conversation with its agent: the agent's process, the ACP connection over its stdin and
// stdout, and one session in the window's folder. The agent reads and writes the folder itself and runs
// its own commands; Texpile offers it no file system or terminal of its own
import type { ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import { killTree } from '../../shell/killTree';
import { lastLine, startAgentProcess } from '../agentProcess';
import { PermissionQueue, type PermissionEvent } from './acpPermissions';
import { onOwnWrite } from './ownWrites';
import { changesBetween, startFrom, takeSnapshot, type TurnChange, type TurnSnapshot } from './turnSnapshot';

export type AgentState = 'starting' | 'ready' | 'working' | 'signed-out' | 'failed';

export type AcpEvent =
	| {
			type: 'state';
			state: AgentState;
			detail?: string;
			title?: string;
			configOptions?: acp.SessionConfigOption[];
			/** the chat now open, once ready */
			chat?: string;
			/** the agent keeps its chats and can open one again */
			history?: boolean;
			/** the agent takes a file's text inside a message, as the selection goes */
			takesSelection?: boolean;
	  }
	| { type: 'update'; update: acp.SessionNotification['update'] }
	| PermissionEvent;

export type PromptResult = { ok: true; stopReason: string; changes: TurnChange[] } | { ok: false; error: string; changes: TurnChange[] };

export type ChatInfo = { id: string; title: string | null; updatedAt: string | null };

export type SessionOptions = {
	program: string;
	args: string[];
	env: Record<string, string>;
	root: string;
	version: string;
	/** Texpile's own tools, for an agent that can reach an MCP server over HTTP */
	mcp: { url: string; token: string } | null;
	emit(event: AcpEvent): void;
};

const MOST_STDERR = 64 * 1024;

function authRequired(e: unknown): boolean {
	return (e as { code?: unknown })?.code === acp.RequestError.authRequired().code;
}

function message(e: unknown): string {
	return e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e);
}

export class AcpSession {
	private child: ChildProcess | null = null;
	private connection: acp.ClientConnection | null = null;
	private sessionId: string | null = null;
	private stderr = '';
	private closing = false;
	private turning = false;
	/** the folder as the last turn left it, so the next one rereads only what changed since */
	private known: TurnSnapshot | undefined;
	private mcpServers: acp.McpServer[] = [];
	private history = false;
	private permissions: PermissionQueue;

	constructor(private o: SessionOptions) {
		this.permissions = new PermissionQueue((e) => o.emit(e));
	}

	async start(): Promise<void> {
		this.o.emit({ type: 'state', state: 'starting' });
		try {
			this.child = startAgentProcess(this.o.program, this.o.args, this.o.root, this.o.env);
		} catch (e) {
			return this.o.emit({ type: 'state', state: 'failed', detail: message(e) });
		}
		const child = this.child;
		child.stderr?.setEncoding('utf8').on('data', (d: string) => (this.stderr = (this.stderr + d).slice(-MOST_STDERR)));
		child.on('error', (e) => this.failed(e.message));
		child.on('exit', (code) => this.failed(lastLine(this.stderr) ?? `exited with code ${code}`));
		const stream = acp.ndJsonStream(Writable.toWeb(child.stdin!), Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>);
		this.connection = acp
			.client({ name: 'texpile' })
			.onRequest(acp.methods.client.session.requestPermission, (ctx) => this.permissions.ask(ctx.params))
			.onNotification(acp.methods.client.session.update, (ctx) => {
				if (ctx.params.sessionId === this.sessionId) this.o.emit({ type: 'update', update: ctx.params.update });
			})
			.connect(stream);
		try {
			const init = await this.connection.agent.request(acp.methods.agent.initialize, {
				protocolVersion: acp.PROTOCOL_VERSION,
				clientCapabilities: {},
				clientInfo: { name: 'texpile', title: 'Texpile', version: this.o.version }
			});
			const mcp = init.agentCapabilities?.mcpCapabilities?.http ? this.o.mcp : null;
			this.mcpServers = mcp
				? [{ type: 'http', name: 'texpile', url: mcp.url, headers: [{ name: 'Authorization', value: `Bearer ${mcp.token}` }] }]
				: [];
			this.history = !!init.agentCapabilities?.loadSession && !!init.agentCapabilities.sessionCapabilities?.list;
			const session = await this.connection.agent.request(acp.methods.agent.session.new, { cwd: this.o.root, mcpServers: this.mcpServers });
			this.sessionId = session.sessionId;
			this.o.emit({
				type: 'state',
				state: 'ready',
				title: init.agentInfo?.title ?? init.agentInfo?.name,
				configOptions: session.configOptions ?? [],
				chat: session.sessionId,
				history: this.history,
				takesSelection: !!init.agentCapabilities?.promptCapabilities?.embeddedContext
			});
		} catch (e) {
			if (this.closing) return;
			if (authRequired(e)) this.o.emit({ type: 'state', state: 'signed-out' });
			else this.failed(message(e));
		}
	}

	async prompt(blocks: acp.ContentBlock[]): Promise<PromptResult> {
		if (!this.connection || !this.sessionId) return { ok: false, error: 'not ready', changes: [] };
		if (this.turning) return { ok: false, error: 'busy', changes: [] };
		this.turning = true;
		this.o.emit({ type: 'state', state: 'working' });
		const saved = new Map<string, string>();
		const stopListening = onOwnWrite((p, text) => {
			const rel = path.relative(this.o.root, p);
			if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) saved.set(rel.split(path.sep).join('/'), text);
		});
		try {
			const before = await takeSnapshot(this.o.root, this.known);
			let outcome: { stopReason: string } | { error: string; signedOut: boolean };
			try {
				const r = await this.connection.agent.request(acp.methods.agent.session.prompt, { sessionId: this.sessionId, prompt: blocks });
				outcome = { stopReason: r.stopReason };
			} catch (e) {
				outcome = { error: message(e), signedOut: authRequired(e) };
			}
			const after = await takeSnapshot(this.o.root, before);
			this.known = after;
			for (const [rel, text] of saved) startFrom(before, rel, text);
			const changes = changesBetween(before, after).map((c) => ({ ...c, path: path.join(this.o.root, c.path) }));
			if ('signedOut' in outcome && outcome.signedOut) this.o.emit({ type: 'state', state: 'signed-out' });
			else if (!this.closing) this.o.emit({ type: 'state', state: 'ready' });
			return 'stopReason' in outcome ? { ok: true, stopReason: outcome.stopReason, changes } : { ok: false, error: outcome.error, changes };
		} finally {
			stopListening();
			this.turning = false;
		}
	}

	/** the agent's own chats in this folder, newest first: the agent keeps them, Texpile keeps none */
	async listChats(): Promise<ChatInfo[]> {
		if (!this.connection || !this.history) return [];
		try {
			const r = await this.connection.agent.request(acp.methods.agent.session.list, { cwd: this.o.root });
			return r.sessions
				.filter((s) => path.relative(s.cwd, this.o.root) === '')
				.map((s) => ({ id: s.sessionId, title: s.title ?? null, updatedAt: s.updatedAt ?? null }))
				.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
		} catch (e) {
			console.error('acp: could not list chats', message(e));
			return [];
		}
	}

	/** the agent replays the chat as session updates, which reach the window as a turn's do */
	async openChat(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
		if (!this.connection || !this.history || this.turning) return { ok: false, error: 'busy' };
		const was = this.sessionId;
		this.sessionId = id;
		this.o.emit({ type: 'state', state: 'starting' });
		try {
			const r = await this.connection.agent.request(acp.methods.agent.session.load, {
				sessionId: id,
				cwd: this.o.root,
				mcpServers: this.mcpServers
			});
			this.o.emit({ type: 'state', state: 'ready', configOptions: r.configOptions ?? [], chat: id, history: true });
			return { ok: true };
		} catch (e) {
			this.sessionId = was;
			if (!this.closing) this.o.emit({ type: 'state', state: 'ready', chat: was ?? undefined, history: true });
			return { ok: false, error: message(e) };
		}
	}

	cancel(): void {
		this.permissions.cancelAll();
		if (this.connection && this.sessionId)
			void this.connection.agent.notify(acp.methods.agent.session.cancel, { sessionId: this.sessionId });
	}

	answer(id: string, optionId: string | null): void {
		this.permissions.answer(id, optionId);
	}

	async setConfig(configId: string, value: string): Promise<void> {
		if (!this.connection || !this.sessionId) return;
		try {
			const r = await this.connection.agent.request(acp.methods.agent.session.setConfigOption, {
				sessionId: this.sessionId,
				configId,
				value
			});
			this.o.emit({ type: 'update', update: { sessionUpdate: 'config_option_update', configOptions: r.configOptions } });
		} catch (e) {
			console.error('acp: could not change', configId, message(e));
		}
	}

	/** says nothing to the window: it closes the conversation itself, or has started the next one */
	close(): void {
		this.closing = true;
		this.permissions.cancelAll();
		this.connection?.close();
		if (this.child?.pid) killTree(this.child.pid);
	}

	private failed(detail: string): void {
		if (this.closing) return;
		this.closing = true;
		this.permissions.cancelAll();
		this.connection?.close();
		this.o.emit({ type: 'state', state: 'failed', detail });
	}
}
