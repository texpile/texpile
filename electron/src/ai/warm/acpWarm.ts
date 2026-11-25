// An agent that speaks ACP, kept running between requests. Each request is a session of its own with no tools, given
// up once it has answered
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import type { AgentPrompt, AgentResult } from '../agentPrompt';
import type { AgentModelList } from '../agentModels';
import { modelOption, selectValues } from '../acp/acpSession';
import { startHeldProcess, watchStop, type HeldPlace, type HeldProcess, type WarmAgent } from './heldProcess';

export type AcpWarmOptions = {
	/** what errors call the agent */
	name: string;
	/** the task's rules are the agent's own already, set where it starts */
	rulesKnown: boolean;
	place: HeldPlace;
	version: string;
};

type Started = { ok: true; init: acp.InitializeResponse } | { ok: false; error: string };

function message(e: unknown): string {
	return e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e);
}

export class AcpWarm implements WarmAgent {
	private proc: HeldProcess;
	private connection: acp.ClientConnection;
	private started: Promise<Started>;
	private exited: Promise<AgentResult>;
	/** each running request's answer so far, by session */
	private answers = new Map<string, string[]>();

	constructor(
		program: string,
		args: string[],
		private o: AcpWarmOptions,
		onExit: () => void
	) {
		let exit: (r: AgentResult) => void = () => {};
		this.exited = new Promise((resolve) => (exit = resolve));
		this.proc = startHeldProcess(
			program,
			args,
			{},
			(error) => {
				exit({ ok: false, error });
				this.connection.close();
				onExit();
			},
			o.place
		);
		const stream = acp.ndJsonStream(
			Writable.toWeb(this.proc.child.stdin!),
			Readable.toWeb(this.proc.child.stdout!) as ReadableStream<Uint8Array>
		);
		this.connection = acp
			.client({ name: 'texpile' })
			// a request has no use for a tool, so none is allowed
			.onRequest(acp.methods.client.session.requestPermission, () => ({ outcome: { outcome: 'cancelled' } }))
			.onNotification(acp.methods.client.session.update, (ctx) => {
				const update = ctx.params.update;
				if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text')
					this.answers.get(ctx.params.sessionId)?.push(update.content.text);
			})
			.connect(stream);
		this.started = this.connection.agent
			.request(acp.methods.agent.initialize, {
				protocolVersion: acp.PROTOCOL_VERSION,
				clientCapabilities: {},
				clientInfo: { name: 'texpile', title: 'Texpile', version: o.version }
			})
			.then(
				(init): Started => ({ ok: true, init }),
				(e): Started => ({ ok: false, error: message(e) })
			);
	}

	private startedOrExited(): Promise<Started> {
		return Promise.race([this.started, this.exited.then((r): Started => ({ ok: false, error: r.ok ? '' : r.error }))]);
	}

	get alive(): boolean {
		return this.proc.alive;
	}

	async ask(prompt: AgentPrompt, signal: AbortSignal, model: string): Promise<AgentResult> {
		const started = await this.startedOrExited();
		if (!started.ok) return { ok: false, error: started.error };
		const caps = started.init.agentCapabilities;
		if (prompt.images?.length && !caps?.promptCapabilities?.image) return { ok: false, error: `${this.o.name} cannot read pictures` };
		const stop = watchStop(signal, this.o.name, this.proc.lastWords);
		const asked: { sessionId?: string } = {};
		const answer = await Promise.race([this.turn(prompt, model, caps, asked), stop.stopped, this.exited]);
		stop.end();
		const sessionId = asked.sessionId;
		if (sessionId) {
			this.answers.delete(sessionId);
			if (answer.ok === false && answer.cancelled) void this.connection.agent.notify(acp.methods.agent.session.cancel, { sessionId });
			if (caps?.sessionCapabilities?.delete)
				void this.connection.agent.request(acp.methods.agent.session.delete, { sessionId }).catch(() => undefined);
		}
		return answer;
	}

	/** the models a new session can pick from */
	async models(): Promise<AgentModelList> {
		const started = await this.startedOrExited();
		if (!started.ok) return { ok: false, error: started.error };
		try {
			const session = await this.connection.agent.request(acp.methods.agent.session.new, { cwd: this.proc.dir, mcpServers: [] });
			if (started.init.agentCapabilities?.sessionCapabilities?.delete)
				void this.connection.agent.request(acp.methods.agent.session.delete, { sessionId: session.sessionId }).catch(() => undefined);
			const option = modelOption(session.configOptions ?? []);
			if (!option) return { ok: false, error: `${this.o.name} lists no models` };
			return { ok: true, models: selectValues(option).map((v) => ({ id: v.value, name: v.name, description: v.description ?? '' })) };
		} catch (e) {
			return { ok: false, error: message(e) };
		}
	}

	private async turn(
		prompt: AgentPrompt,
		model: string,
		caps: acp.AgentCapabilities | undefined,
		asked: { sessionId?: string }
	): Promise<AgentResult> {
		const name = this.o.name;
		// an agent that takes the rules as its instructions gets them there; any other reads them at the top of the request
		const asSystem = !this.o.rulesKnown && !!prompt.system && !!caps?.sessionCapabilities?.systemPrompt;
		const inRequest = !this.o.rulesKnown && !asSystem && !!prompt.system;
		const mode = caps?.sessionCapabilities?.systemPrompt?.mode?.override ? 'override' : 'append';
		try {
			const session = await this.connection.agent.request(acp.methods.agent.session.new, {
				cwd: this.proc.dir,
				mcpServers: [],
				...(asSystem ? { systemPrompt: { mode, content: [{ type: 'text', text: prompt.system }] } } : {})
			});
			const sessionId = session.sessionId;
			asked.sessionId = sessionId;
			const texts: string[] = [];
			this.answers.set(sessionId, texts);
			const option = model ? modelOption(session.configOptions ?? []) : undefined;
			if (option && option.currentValue !== model) {
				if (!selectValues(option).some((v) => v.value === model)) return { ok: false, error: `${name} does not offer the model ${model}` };
				await this.connection.agent.request(acp.methods.agent.session.setConfigOption, { sessionId, configId: option.id, value: model });
			}
			const text = inRequest ? `${prompt.system}\n\n${prompt.request}` : prompt.request;
			const blocks: acp.ContentBlock[] = [
				...(prompt.images ?? []).map((i): acp.ContentBlock => ({ type: 'image', mimeType: i.mediaType, data: i.base64 })),
				{ type: 'text', text }
			];
			const r = await this.connection.agent.request(acp.methods.agent.session.prompt, { sessionId, prompt: blocks });
			const answer = texts.join('');
			if (r.stopReason !== 'end_turn') return { ok: false, error: `${name} stopped: ${r.stopReason}` };
			return answer.trim() ? { ok: true, text: answer } : { ok: false, error: `${name} gave no answer` };
		} catch (e) {
			if ((e as { code?: unknown })?.code === acp.RequestError.authRequired().code)
				return { ok: false, error: `${name} is not signed in. Run it once in a terminal to sign in.` };
			return { ok: false, error: message(e) };
		}
	}

	close(): void {
		this.connection.close();
		this.proc.close();
	}
}
