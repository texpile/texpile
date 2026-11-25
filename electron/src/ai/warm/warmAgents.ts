// The agents kept running for proofread and Refine. Claude Code reads its rules once, so each task holds its own
// process; Codex takes them per thread, so one serves both. The others start for each request
import { app } from 'electron';
import { findProgram } from '../../shell/findProgram';
import { shellEnvReady } from '../../shell/shellEnv';
import { agentArgv, CODEX_WARM_ARGS, claudeWarmArgs } from '../agentCommand';
import { agentModelOf } from '../agentChoice';
import { agentStdio } from '../agentStdio';
import { runAgent, type AgentPrompt, type AgentResult } from '../runAgent';
import { ClaudeWarm } from './claudeWarm';
import { CodexWarm } from './codexWarm';
import type { WarmAgent } from './heldProcess';

export type AgentTask = 'proofread' | 'refine' | 'image';

type Held = { key: string; agent: WarmAgent; idle?: NodeJS.Timeout };

const IDLE_MS = 15 * 60_000;

const held = new Map<string, Held>();
let quitHooked = false;

function release(slot: string): void {
	const h = held.get(slot);
	if (!h) return;
	held.delete(slot);
	clearTimeout(h.idle);
	h.agent.close();
}

function hold(slot: string, key: string, start: (onExit: () => void) => WarmAgent): WarmAgent {
	const h = held.get(slot);
	if (h && h.key === key && h.agent.alive) return h.agent;
	release(slot);
	if (!quitHooked) {
		quitHooked = true;
		app.once('will-quit', () => [...held.keys()].forEach(release));
	}
	const entry = { key } as Held;
	entry.agent = start(() => {
		if (held.get(slot) !== entry) return;
		held.delete(slot);
		clearTimeout(entry.idle);
	});
	held.set(slot, entry);
	return entry.agent;
}

function idleFrom(slot: string): void {
	const h = held.get(slot);
	if (!h) return;
	clearTimeout(h.idle);
	h.idle = setTimeout(() => release(slot), IDLE_MS);
}

export async function askAgent(
	task: AgentTask,
	agent: string,
	s: Record<string, unknown>,
	prompt: AgentPrompt,
	signal: AbortSignal
): Promise<AgentResult> {
	await shellEnvReady();
	const model = agentModelOf(s, agent);
	if (agent !== 'claude' && agent !== 'codex') {
		const argv = agentArgv(agent, s.aiAgentCommand, model);
		if (!argv) return { ok: false, error: 'no agent is set in Preferences' };
		return runAgent(argv, prompt, signal, agentStdio(agent));
	}
	const program = findProgram(agent);
	if (!program) return { ok: false, error: `${agent} was not found on PATH` };
	const slot = agent === 'claude' ? `claude:${task}` : 'codex';
	let warm: WarmAgent;
	try {
		warm =
			agent === 'claude'
				? hold(
						slot,
						[program, model, prompt.system].join('\0'),
						(onExit) => new ClaudeWarm(program, claudeWarmArgs(model), prompt.system, onExit)
					)
				: hold(slot, [program, model].join('\0'), (onExit) => new CodexWarm(program, CODEX_WARM_ARGS, model, app.getVersion(), onExit));
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
	idleFrom(slot);
	const answer = await warm.ask(prompt, signal);
	idleFrom(slot);
	return answer;
}
