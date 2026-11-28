// Settings from before one agent served every AI feature, moved into it as the file is read: Refine's agent or else the
// Agent tab's, the custom ACP command, Refine's models, and AI turned off where both had been turned off
import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import { DEFAULT_AGENT_MODELS, isAiAgent, type AiAgent } from './agentChoice';

const OLD_SETTINGS = [
	'aiAgent',
	'aiAgentModel',
	'aiAgentModels',
	'aiAgentCommand',
	'refineAgents',
	'agentPanel',
	'agentPanelAgents',
	'agentPanelCommand',
	'aiServiceUrl',
	'aiServiceModel',
	'aiService',
	'aiAnthropicModel',
	'aiOpenAiUrl',
	'aiOpenAiModel'
];

function isRecord(v: unknown): v is Record<string, unknown> {
	return !!v && typeof v === 'object' && !Array.isArray(v);
}

function text(v: unknown): string {
	return typeof v === 'string' ? v : '';
}

function emptyList(v: unknown): boolean {
	return Array.isArray(v) && v.length === 0;
}

/** Refine's agent first, as the one most used; agy's place goes to Gemini, Google's agent that speaks ACP */
function agentOf(old: Record<string, unknown>): AiAgent | '' {
	const refine = Array.isArray(old.refineAgents) ? old.refineAgents[0] : old.aiAgent;
	const command = text(old.agentPanelCommand);
	const usable = (a: unknown): a is AiAgent => isAiAgent(a) && (a !== 'custom' || !!command);
	return [refine === 'agy' ? 'gemini' : refine, old.agentPanel].find(usable) ?? '';
}

/** each agent's Refine model, which was the one model it ran */
function modelsOf(old: Record<string, unknown>): Record<string, Record<string, string>> {
	const refine: Record<string, unknown> = {
		...(text(old.aiAgent) ? { [text(old.aiAgent)]: old.aiAgentModel } : {}),
		...(isRecord(old.aiAgentModels) ? old.aiAgentModels : {})
	};
	const models: Record<string, Record<string, string>> = structuredClone(DEFAULT_AGENT_MODELS);
	for (const [agent, model] of Object.entries(refine))
		if (isAiAgent(agent) && text(model)) models[agent] = { ...models[agent], refine: text(model) };
	return models;
}

export function upgradeAgentSettings(stored: Record<string, unknown>): Record<string, unknown> {
	if (!OLD_SETTINGS.some((k) => k in stored)) return stored;
	const out = { ...stored };
	for (const k of OLD_SETTINGS) delete out[k];
	if ('agent' in stored) return out;
	out.agent = agentOf(stored);
	if (text(stored.agentPanelCommand)) out.agentCommand = text(stored.agentPanelCommand);
	out.agentModels = modelsOf(stored);
	const panelOff = stored.agentPanel === 'off' || emptyList(stored.agentPanelAgents);
	if (emptyList(stored.refineAgents) && panelOff) out.aiOff = true;
	return out;
}

/** the custom service's key, which nothing reads any more */
export function removeServiceKey(): void {
	fs.rm(path.join(app.getPath('userData'), 'ai-keys.json'), { force: true }, () => {});
}
