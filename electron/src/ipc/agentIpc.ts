// The reader's own agent, run for the renderer: which presets are installed, the models one offers, a run, a test, and a
// cancel. The agent comes from settings.json here in main, never from the request: a request chooses only the prompt
import { ipcMain } from 'electron';
import { readSettings } from '../appSettings';
import { shellEnvReady } from '../shell/shellEnv';
import { findProgram } from '../shell/findProgram';
import { isAiAgent, PRESET_AGENTS } from '../ai/agentChoice';
import { presetProgram } from '../ai/acp/acpAgents';
import { listModels } from '../ai/warm/warmAgents';
import { askAi } from '../ai/askAi';
import { removeServiceKey } from '../ai/agentSettingsUpgrade';

const running = new Map<string, AbortController>();

const TEST_TIMEOUT_MS = 60_000;

export function registerAgentIpc(): void {
	removeServiceKey();
	ipcMain.handle('agent:detect', async () => {
		await shellEnvReady();
		return Object.fromEntries(PRESET_AGENTS.map((a) => [a, findProgram(presetProgram(a)) !== null]));
	});

	ipcMain.handle('agent:models', (_e, agent: unknown) =>
		isAiAgent(agent) ? listModels(agent, readSettings()) : { ok: false, error: 'bad request' }
	);

	ipcMain.handle('agent:run', async (e, req: { id?: unknown; prompt?: unknown; system?: unknown }) => {
		if (typeof req?.id !== 'string' || typeof req.prompt !== 'string') return { ok: false, error: 'bad request' };
		const system = typeof req.system === 'string' ? req.system : '';
		const abort = new AbortController();
		running.set(req.id, abort);
		// a window that closed can no longer cancel its own run
		function stop(): void {
			abort.abort();
		}
		e.sender.once('destroyed', stop);
		try {
			return await askAi('refine', readSettings(), { system, request: req.prompt }, abort.signal);
		} finally {
			running.delete(req.id);
			e.sender.removeListener('destroyed', stop);
		}
	});

	ipcMain.handle('agent:test', () =>
		askAi('test', readSettings(), { system: 'Reply with the single word OK.', request: 'OK?' }, AbortSignal.timeout(TEST_TIMEOUT_MS))
	);

	ipcMain.on('agent:cancel', (_e, id: unknown) => {
		if (typeof id === 'string') running.get(id)?.abort();
	});
}
