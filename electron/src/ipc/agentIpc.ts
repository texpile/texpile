// The reader's own agents, run for the renderer: which presets are installed, their models, a run, and its cancel. The
// command comes from settings.json here in main, never from the request: a request chooses the prompt, and which of the
// agents ticked in Preferences runs it
import { app, ipcMain } from 'electron';
import { readSettings } from '../appSettings';
import { shellEnvReady } from '../shell/shellEnv';
import { findProgram } from '../shell/findProgram';
import { agentArgv, PRESET_AGENTS, type PresetAgent } from '../ai/agentCommand';
import { runAgent } from '../ai/runAgent';
import { agentStdio } from '../ai/agentStdio';
import { listAgentModels } from '../ai/agentModels';

const running = new Map<string, AbortController>();

/** the agent Refine may run, as the renderer's refineAgents.svelte.ts reads it: the one picked, none before that */
function refineAgentsAllowed(s: Record<string, unknown>): string[] {
	return Array.isArray(s.refineAgents) ? s.refineAgents.filter((a): a is string => typeof a === 'string').slice(0, 1) : [];
}

/** a preset's model; '' is its own default */
function modelOf(s: Record<string, unknown>, agent: string): string {
	const own = s.aiAgentModels && typeof s.aiAgentModels === 'object' ? (s.aiAgentModels as Record<string, unknown>)[agent] : '';
	return typeof own === 'string' ? own : '';
}

export function registerAgentIpc(): void {
	ipcMain.handle('agent:detect', async () => {
		await shellEnvReady();
		return Object.fromEntries(PRESET_AGENTS.map((a) => [a, findProgram(a) !== null]));
	});

	ipcMain.handle('agent:models', (_e, agent: unknown) =>
		PRESET_AGENTS.includes(agent as PresetAgent)
			? listAgentModels(agent as PresetAgent, app.getVersion())
			: { ok: false, error: 'bad request' }
	);

	ipcMain.handle('agent:run', async (e, req: { id?: unknown; prompt?: unknown; system?: unknown; agent?: unknown }) => {
		if (typeof req?.id !== 'string' || typeof req.prompt !== 'string' || typeof req.agent !== 'string')
			return { ok: false, error: 'bad request' };
		const system = typeof req.system === 'string' ? req.system : '';
		const s = readSettings();
		await shellEnvReady();
		if (!refineAgentsAllowed(s).includes(req.agent)) return { ok: false, error: 'that agent is not ticked in Preferences' };
		const argv = agentArgv(req.agent, s.aiAgentCommand, modelOf(s, req.agent));
		if (!argv) return { ok: false, error: 'no agent is set in Preferences' };
		const abort = new AbortController();
		running.set(req.id, abort);
		// a window that closed can no longer cancel its own run
		function stop(): void {
			abort.abort();
		}
		e.sender.once('destroyed', stop);
		try {
			return await runAgent(argv, { system, request: req.prompt }, abort.signal, agentStdio(req.agent));
		} finally {
			running.delete(req.id);
			e.sender.removeListener('destroyed', stop);
		}
	});

	ipcMain.on('agent:cancel', (_e, id: unknown) => {
		if (typeof id === 'string') running.get(id)?.abort();
	});
}
