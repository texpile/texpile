// The reader's own agents, run for the renderer: which presets are installed, their models, a run, and its cancel. The
// command comes from settings.json here in main, never from the request: a request chooses the prompt, and which of the
// agents ticked in Preferences runs it
import { app, ipcMain } from 'electron';
import { readSettings } from '../appSettings';
import { shellEnvReady } from '../shell/shellEnv';
import { findProgram } from '../shell/findProgram';
import { PRESET_AGENTS, type PresetAgent } from '../ai/agentCommand';
import { listAgentModels } from '../ai/agentModels';
import { refineAgentsAllowed } from '../ai/agentChoice';
import { askAgent } from '../ai/warm/warmAgents';

const running = new Map<string, AbortController>();

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
		if (!refineAgentsAllowed(s).includes(req.agent)) return { ok: false, error: 'that agent is not ticked in Preferences' };
		const abort = new AbortController();
		running.set(req.id, abort);
		// a window that closed can no longer cancel its own run
		function stop(): void {
			abort.abort();
		}
		e.sender.once('destroyed', stop);
		try {
			return await askAgent('refine', req.agent, s, { system, request: req.prompt }, abort.signal);
		} finally {
			running.delete(req.id);
			e.sender.removeListener('destroyed', stop);
		}
	});

	ipcMain.on('agent:cancel', (_e, id: unknown) => {
		if (typeof id === 'string') running.get(id)?.abort();
	});
}
