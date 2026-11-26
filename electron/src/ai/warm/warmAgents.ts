// The agent kept running for proofread, Refine and Convert to LaTeX. Claude Code and OpenCode read their rules once, so
// each task holds its own process; Codex and the other ACP agents take them per request, so one serves every task
import { app } from 'electron';
import { findProgram } from '../../shell/findProgram';
import { shellEnvReady } from '../../shell/shellEnv';
import { agentsDir } from '../../appIdentity';
import { CODEX_WARM_ARGS, claudeWarmArgs } from '../agentCommand';
import { agentModelOf, type AiAgent, type AiTask } from '../agentChoice';
import { agentLaunch } from '../acp/acpAgents';
import type { AgentPrompt, AgentResult } from '../agentPrompt';
import { listAgentModels, type AgentModelList } from '../agentModels';
import { AcpWarm } from './acpWarm';
import { ClaudeWarm } from './claudeWarm';
import { CodexWarm } from './codexWarm';
import { watchStop, type WarmAgent } from './heldProcess';
import { openCodePlace } from './openCodePlace';
import { signInError } from '../agentSignIn';

/** test is Preferences' Test agent, released once it answers */
export type AgentTask = AiTask | 'test';

type Held = { key: string; agent: WarmAgent; idle?: NodeJS.Timeout };

const IDLE_MS = 15 * 60_000;
// a process of Proofread document's own goes soon after the run
const EXTRA_LANE_IDLE_MS = 60_000;
// proofreading is a rewrite, which thinking makes slower and no better
const EFFORT: Partial<Record<AgentTask, string>> = { proofread: 'low', math: 'low' };

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
	h.idle = setTimeout(() => release(slot), /#\d+$/.test(slot) ? EXTRA_LANE_IDLE_MS : IDLE_MS);
}

/** what errors call the agent */
const NAMES: Record<AiAgent, string> = {
	claude: 'Claude Code',
	codex: 'Codex',
	opencode: 'OpenCode',
	gemini: 'Gemini',
	copilot: 'Copilot',
	custom: 'The agent'
};

type Starter = { slot: string; key: string; start(onExit: () => void): WarmAgent };

async function starterOf(
	task: AgentTask,
	agent: AiAgent,
	s: Record<string, unknown>,
	system: string,
	model: string,
	lane: number
): Promise<Starter | string> {
	const version = app.getVersion();
	if (agent === 'claude' || agent === 'codex') {
		const program = findProgram(agent);
		if (!program) return `${agent} was not found on PATH`;
		if (agent === 'codex')
			return { slot: 'codex', key: program, start: (onExit) => new CodexWarm(program, CODEX_WARM_ARGS, version, onExit) };
		// Claude Code answers a turn at a time, so a request beside another needs a process of its own
		return {
			slot: `claude:${task}${lane ? `#${lane}` : ''}`,
			key: [program, model, system].join('\0'),
			start: (onExit) => new ClaudeWarm(program, claudeWarmArgs(model, EFFORT[task] ?? ''), system, onExit)
		};
	}
	const launch = agentLaunch(agent, s.agentCommand, { findProgram, adapterDir: agentsDir(), execPath: process.execPath });
	if (!launch.ok) return launch.reason === 'missing' ? `${launch.program} was not found on PATH` : 'no agent command is set in Preferences';
	const name = NAMES[agent];
	const key = [launch.program, ...launch.args].join('\0');
	if (agent !== 'opencode')
		return {
			slot: agent,
			key,
			start: (onExit) => new AcpWarm(launch.program, launch.args, { name, rulesKnown: false, place: { env: launch.env }, version }, onExit)
		};
	const place = await openCodePlace(task, system);
	return {
		slot: `opencode:${task}`,
		key: [key, system].join('\0'),
		start: (onExit) => new AcpWarm(launch.program, launch.args, { name, rulesKnown: true, place, version }, onExit)
	};
}

export async function askAgent(
	task: AgentTask,
	agent: AiAgent,
	s: Record<string, unknown>,
	prompt: AgentPrompt,
	signal: AbortSignal,
	lane = 0
): Promise<AgentResult> {
	await shellEnvReady();
	// the math search takes the Proofread model: both want a fast answer
	const model = agentModelOf(s, agent, task === 'test' || task === 'math' ? 'proofread' : task);
	const starter = await starterOf(task, agent, s, prompt.system, model, lane);
	if (typeof starter === 'string') return { ok: false, error: starter };
	let warm: WarmAgent;
	try {
		warm = hold(starter.slot, starter.key, starter.start);
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
	idleFrom(starter.slot);
	let settled = false;
	const effort = EFFORT[task];
	const asking = warm.ask(effort ? { ...prompt, effort } : prompt, signal, model).finally(() => (settled = true));
	// an agent that never answers its start or a queued request is stopped here too, and its process goes
	const guard = watchStop(signal, NAMES[agent], () => undefined);
	const answer = await Promise.race([asking, guard.stopped]);
	guard.end();
	if (!settled) {
		release(starter.slot);
		return answer;
	}
	// a process of the test's own goes; one the tasks share stays warm for them
	if (starter.slot.endsWith(':test')) release(starter.slot);
	else idleFrom(starter.slot);
	const signIn = answer.ok ? null : signInError(agent, answer.error);
	return signIn ? { ok: false, error: signIn } : answer;
}

/** starts the task's process ahead of its first request, as the math search opens */
export async function warmAgent(task: AiTask, agent: AiAgent, s: Record<string, unknown>, system: string): Promise<void> {
	await shellEnvReady();
	const starter = await starterOf(task, agent, s, system, agentModelOf(s, agent, task === 'math' ? 'proofread' : task), 0);
	if (typeof starter === 'string') return;
	try {
		hold(starter.slot, starter.key, starter.start);
		idleFrom(starter.slot);
	} catch {
		// the request that follows says what went wrong
	}
}

/** asked of the agent itself, in a process of its own that ends with the answer */
export async function listModels(agent: AiAgent, s: Record<string, unknown>): Promise<AgentModelList> {
	await shellEnvReady();
	if (agent === 'claude' || agent === 'codex') return listAgentModels(agent, app.getVersion());
	const launch = agentLaunch(agent, s.agentCommand, { findProgram, adapterDir: agentsDir(), execPath: process.execPath });
	if (!launch.ok)
		return { ok: false, error: launch.reason === 'missing' ? `${launch.program} was not found on PATH` : 'no agent command is set' };
	const place = agent === 'opencode' ? await openCodePlace('models', '') : { env: launch.env };
	const warm = new AcpWarm(
		launch.program,
		launch.args,
		{ name: NAMES[agent], rulesKnown: false, place, version: app.getVersion() },
		() => {}
	);
	const timeout = new Promise<AgentModelList>((done) =>
		setTimeout(() => done({ ok: false, error: `${NAMES[agent]} did not answer` }), 30_000)
	);
	try {
		return await Promise.race([warm.models(), timeout]);
	} finally {
		warm.close();
	}
}
