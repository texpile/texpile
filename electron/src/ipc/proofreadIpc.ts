// Proofreading for the window: a paragraph batch sent to the agent picked in Preferences. The agent comes from main,
// never from the request
import { ipcMain } from 'electron';
import { readSettings } from '../appSettings';
import { askAi } from '../ai/askAi';
import type { ProofreadAnswer, ProofreadPrompt } from '../ai/proofread/proofreadAnswer';

// a guard against a loop sending the same paragraphs again and again
const DAILY_LIMIT = 2000;
const TIMEOUT_MS = 90_000;

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

// Proofread document runs up to this many at once
const LANES = 3;

async function proofread(prompt: ProofreadPrompt, lane: number): Promise<ProofreadAnswer> {
	const s = readSettings();
	if (s.aiOff === true || s.proofreadAi !== true) return { ok: false, error: 'Proofread with AI is off.' };
	if (!underDailyLimit()) return { ok: false, error: `The daily limit of ${DAILY_LIMIT} requests is reached.` };
	const signal = AbortSignal.timeout(TIMEOUT_MS);
	const result = await askAi('proofread', s, prompt, signal, lane);
	if (result.ok) return result;
	return { ok: false, error: signal.aborted ? `The AI agent did not answer within ${TIMEOUT_MS / 1000} seconds.` : result.error };
}

export function registerProofreadIpc(): void {
	ipcMain.handle('proofread:review', (_e, req: { system?: unknown; request?: unknown; lane?: unknown }) => {
		if (typeof req?.system !== 'string' || typeof req.request !== 'string') return { ok: false, error: 'bad request' };
		const lane = typeof req.lane === 'number' && Number.isInteger(req.lane) ? Math.min(Math.max(req.lane, 0), LANES - 1) : 0;
		return proofread({ system: req.system, request: req.request }, lane);
	});
}
