// Claude Code kept running between requests, a turn at a time over stream JSON. It reads its rules once, at start;
// /clear after each turn starts the next request without the last one
import type { AgentPrompt, AgentResult } from '../agentPrompt';
import { startHeldProcess, watchStop, type HeldProcess, type WarmAgent } from './heldProcess';
import { onJsonLines, writeJsonLine, type JsonMessage } from './jsonLines';

const CLEAR_MS = 30_000;

/** its result message, or why the process ended */
type TurnEnd = JsonMessage | string;

function answerOf(end: TurnEnd): AgentResult {
	if (typeof end === 'string') return { ok: false, error: end };
	const text = typeof end.result === 'string' ? end.result : '';
	if (end.subtype === 'success' && end.is_error !== true && text.trim()) return { ok: true, text };
	const errors = Array.isArray(end.errors) ? end.errors.filter((e) => typeof e === 'string').join('. ') : '';
	return { ok: false, error: text || errors || 'claude gave no answer' };
}

export class ClaudeWarm implements WarmAgent {
	private proc: HeldProcess;
	private waiting: ((end: TurnEnd) => void) | null = null;
	private queue: Promise<unknown> = Promise.resolve();

	constructor(program: string, args: string[], system: string, onExit: () => void) {
		// its telemetry and update checks add about 2 s to every turn (2.1.332: 2.9 s a short request, 0.9 s without)
		const quiet = { env: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } };
		this.proc = startHeldProcess(
			program,
			args,
			{ 'system.txt': system },
			(error) => {
				this.endTurn(error);
				onExit();
			},
			quiet
		);
		onJsonLines(this.proc.child.stdout, (msg) => {
			if (msg.type === 'result') this.endTurn(msg);
		});
	}

	private endTurn(end: TurnEnd): void {
		const waiting = this.waiting;
		this.waiting = null;
		waiting?.(end);
	}

	private send(content: string | object[]): Promise<TurnEnd> {
		if (this.proc.exitError !== null) return Promise.resolve(this.proc.exitError);
		return new Promise((resolve) => {
			this.waiting = resolve;
			writeJsonLine(this.proc.child.stdin, { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null, session_id: '' });
		});
	}

	get alive(): boolean {
		return this.proc.alive;
	}

	ask(prompt: AgentPrompt, signal: AbortSignal): Promise<AgentResult> {
		const turn = this.queue.then(() => this.turn(prompt, signal));
		this.queue = turn.then(
			() => (this.proc.alive ? this.clear() : null),
			() => {}
		);
		return turn;
	}

	// a /clear with no result holds every later request, so the process goes and the next request starts a new one
	private async clear(): Promise<void> {
		let timer: NodeJS.Timeout | undefined;
		const late = new Promise<'late'>((done) => (timer = setTimeout(() => done('late'), CLEAR_MS)));
		if ((await Promise.race([this.send('/clear'), late])) === 'late') this.close();
		clearTimeout(timer);
	}

	private async turn(prompt: AgentPrompt, signal: AbortSignal): Promise<AgentResult> {
		const stop = watchStop(signal, 'claude', this.proc.lastWords);
		const content = prompt.images?.length
			? [
					...prompt.images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.base64 } })),
					{ type: 'text', text: prompt.request }
				]
			: prompt.request;
		const answer = await Promise.race([this.send(content).then(answerOf), stop.stopped]);
		stop.end();
		// a turn cannot be taken back, and a sign-in or limit error is better met by a fresh start
		if (!answer.ok) this.close();
		return answer;
	}

	close(): void {
		this.proc.close();
	}
}
