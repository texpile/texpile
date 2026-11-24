// Proofreading for the window: a paragraph batch sent to the service picked in Preferences, and the keys it sends with.
// The service, its address and the key come from main, never from the request
import { ipcMain } from 'electron';
import { readSettings } from '../appSettings';
import { shellEnvReady } from '../shell/shellEnv';
import { agentArgv } from '../ai/agentCommand';
import { agentModelOf, refineAgentsAllowed } from '../ai/agentChoice';
import { agentStdio } from '../ai/agentStdio';
import { runAgent } from '../ai/runAgent';
import { anthropicProofread, openAiProofread } from '../ai/proofread/aiSdkProofread';
import { KEY_PROVIDERS, proofreadKey, proofreadKeysKept, setProofreadKey, type KeyProvider } from '../ai/proofread/proofreadKeys';
import type { ProofreadAnswer, ProofreadPrompt } from '../ai/proofread/proofreadAnswer';

// a guard against a loop sending the same paragraphs again and again
const DAILY_LIMIT = 2000;
const AGENT_TIMEOUT_MS = 90_000;

let day = '';
let sentToday = 0;

function underDailyLimit(): boolean {
	const today = new Date().toDateString();
	if (today !== day) {
		day = today;
		sentToday = 0;
	}
	return ++sentToday <= DAILY_LIMIT;
}

function text(s: Record<string, unknown>, key: string): string {
	return typeof s[key] === 'string' ? (s[key] as string) : '';
}

async function proofreadWithAgent(s: Record<string, unknown>, prompt: ProofreadPrompt): Promise<ProofreadAnswer> {
	const agent = refineAgentsAllowed(s)[0];
	const argv = agent ? agentArgv(agent, s.aiAgentCommand, agentModelOf(s, agent)) : null;
	if (!agent || !argv) return { ok: false, error: 'No agent is picked under Refine with.' };
	await shellEnvReady();
	const result = await runAgent(argv, prompt, AbortSignal.timeout(AGENT_TIMEOUT_MS), agentStdio(agent));
	return result.ok ? result : { ok: false, error: result.error };
}

async function proofread(prompt: ProofreadPrompt): Promise<ProofreadAnswer> {
	const s = readSettings();
	if (s.aiOff === true || s.proofreadAi !== true) return { ok: false, error: 'Proofread with AI is off.' };
	if (!underDailyLimit()) return { ok: false, error: `The daily limit of ${DAILY_LIMIT} requests is reached.` };
	if (s.proofreadWith === 'agent') return proofreadWithAgent(s, prompt);
	if (s.proofreadWith === 'openai')
		return openAiProofread(text(s, 'proofreadOpenAiUrl'), proofreadKey('openai'), text(s, 'proofreadOpenAiModel'), prompt);
	const key = proofreadKey('anthropic');
	if (!key) return { ok: false, error: 'No Anthropic API key is saved.' };
	return anthropicProofread(key, text(s, 'proofreadAnthropicModel'), prompt);
}

export function registerProofreadIpc(): void {
	ipcMain.handle('proofread:review', (_e, req: { system?: unknown; request?: unknown }) => {
		if (typeof req?.system !== 'string' || typeof req.request !== 'string') return { ok: false, error: 'bad request' };
		return proofread({ system: req.system, request: req.request });
	});

	ipcMain.handle('proofread:keys', () => proofreadKeysKept());

	ipcMain.handle('proofread:setKey', (_e, req: { provider?: unknown; key?: unknown }) => {
		if (!KEY_PROVIDERS.includes(req?.provider as KeyProvider) || typeof req.key !== 'string') return proofreadKeysKept();
		setProofreadKey(req.provider as KeyProvider, req.key.trim());
		return proofreadKeysKept();
	});
}
