// Codex's app server kept running between requests. Each request is a thread of its own, which carries its rules and
// model, so one server takes every task
import type { AgentPrompt, AgentResult } from '../agentPrompt';
import { startHeldProcess, watchStop, type HeldProcess, type WarmAgent } from './heldProcess';
import { onJsonLines, writeJsonLine, type JsonMessage } from './jsonLines';

type Turn = { texts: string[]; done(end: JsonMessage | string): void };

function record(v: unknown): JsonMessage {
	return v && typeof v === 'object' ? (v as JsonMessage) : {};
}

function text(v: unknown): string {
	return typeof v === 'string' ? v : '';
}

function errorOf(msg: JsonMessage): string | null {
	return msg.error === undefined ? null : text(record(msg.error).message) || 'codex refused the request';
}

export class CodexWarm implements WarmAgent {
	private proc: HeldProcess;
	private nextId = 0;
	private replies = new Map<unknown, (msg: JsonMessage) => void>();
	/** by thread */
	private turns = new Map<string, Turn>();
	private ready: Promise<string | null>;

	constructor(program: string, args: string[], version: string, onExit: () => void) {
		this.proc = startHeldProcess(program, args, {}, (error) => {
			for (const reply of this.replies.values()) reply({ error: { message: error } });
			for (const turn of this.turns.values()) turn.done(error);
			this.replies.clear();
			this.turns.clear();
			onExit();
		});
		onJsonLines(this.proc.child.stdout, (msg) => this.take(msg));
		this.ready = this.request('initialize', { clientInfo: { name: 'texpile', title: 'Texpile', version } }).then((r) => {
			const error = errorOf(r);
			if (!error) writeJsonLine(this.proc.child.stdin, { method: 'initialized' });
			return error;
		});
	}

	get alive(): boolean {
		return this.proc.alive;
	}

	private take(msg: JsonMessage): void {
		// no tools and no approvals are offered, so nothing it asks has an answer here
		if (msg.id !== undefined && msg.method !== undefined) {
			writeJsonLine(this.proc.child.stdin, { id: msg.id, error: { code: -32601, message: 'not supported' } });
			return;
		}
		if (msg.id !== undefined) {
			const reply = this.replies.get(msg.id);
			this.replies.delete(msg.id);
			reply?.(msg);
			return;
		}
		const params = record(msg.params);
		const turn = this.turns.get(text(params.threadId));
		if (!turn) return;
		const item = record(params.item);
		if (msg.method === 'item/completed' && item.type === 'agentMessage' && text(item.text)) turn.texts.push(text(item.text));
		if (msg.method === 'turn/completed') {
			this.turns.delete(text(params.threadId));
			turn.done(record(params.turn));
		}
	}

	private request(method: string, params: object): Promise<JsonMessage> {
		if (this.proc.exitError !== null) return Promise.resolve({ error: { message: this.proc.exitError } });
		const id = ++this.nextId;
		return new Promise((resolve) => {
			this.replies.set(id, resolve);
			writeJsonLine(this.proc.child.stdin, { id, method, params });
		});
	}

	async ask(prompt: AgentPrompt, signal: AbortSignal, model: string): Promise<AgentResult> {
		const notReady = await this.ready;
		if (notReady) return { ok: false, error: notReady };
		const started = await this.request('thread/start', {
			cwd: this.proc.dir,
			sandbox: 'read-only',
			approvalPolicy: 'never',
			ephemeral: true,
			...(prompt.system ? { baseInstructions: prompt.system } : {}),
			...(model ? { model } : {})
		});
		const threadId = text(record(record(started.result).thread).id);
		if (!threadId) return { ok: false, error: errorOf(started) ?? 'codex started no thread' };
		const texts: string[] = [];
		const finished = new Promise<JsonMessage | string>((done) => this.turns.set(threadId, { texts, done }));
		const stop = watchStop(signal, 'codex', this.proc.lastWords);
		const turnStarted = await this.request('turn/start', {
			threadId,
			...(prompt.effort ? { effort: prompt.effort } : {}),
			input: [
				{ type: 'text', text: prompt.request, text_elements: [] },
				...(prompt.images ?? []).map((i) => ({ type: 'image', url: `data:${i.mediaType};base64,${i.base64}` }))
			]
		});
		const turnId = text(record(record(turnStarted.result).turn).id);
		const outcome = turnId
			? await Promise.race([finished.then((end) => ({ end })), stop.stopped.then((stopped) => ({ stopped }))])
			: { end: errorOf(turnStarted) ?? 'codex started no turn' };
		stop.end();
		this.turns.delete(threadId);
		if ('stopped' in outcome) void this.request('turn/interrupt', { threadId, turnId });
		void this.request('thread/unsubscribe', { threadId });
		if ('stopped' in outcome) return outcome.stopped;
		const end = outcome.end;
		if (typeof end === 'string') return { ok: false, error: end };
		if (end.status !== 'completed')
			return { ok: false, error: text(record(end.error).message) || `codex ended the turn as ${text(end.status)}` };
		const answer = texts.at(-1) ?? '';
		return answer.trim() ? { ok: true, text: answer } : { ok: false, error: 'codex gave no answer' };
	}

	close(): void {
		this.proc.close();
	}
}
