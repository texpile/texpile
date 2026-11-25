// A request to the AI service picked in Preferences: one of the reader's agents, or the custom service
import { refineAgentsAllowed } from './agentChoice';
import { askAgent, type AgentTask } from './warm/warmAgents';
import { askService } from './service/customService';
import { serviceKey } from './service/serviceKey';
import type { AgentPrompt, AgentResult } from './runAgent';

/** the agents that can look at a picture */
export const SEES_IMAGES = ['claude', 'codex', 'service'];

/** the one picked, or null with none or with all AI off */
export function aiServiceOf(s: Record<string, unknown>): string | null {
	return refineAgentsAllowed(s)[0] ?? null;
}

function text(v: unknown): string {
	return typeof v === 'string' ? v : '';
}

export function askAi(task: AgentTask, s: Record<string, unknown>, prompt: AgentPrompt, signal: AbortSignal): Promise<AgentResult> {
	const service = aiServiceOf(s);
	if (!service) return Promise.resolve({ ok: false, error: 'No AI service is picked in Preferences.' });
	if (prompt.images?.length && !SEES_IMAGES.includes(service))
		return Promise.resolve({ ok: false, error: 'This AI service cannot read pictures.' });
	if (service !== 'service') return askAgent(task, service, s, prompt, signal);
	return askService({ url: text(s.aiServiceUrl), key: serviceKey(), model: text(s.aiServiceModel) }, prompt, signal);
}
