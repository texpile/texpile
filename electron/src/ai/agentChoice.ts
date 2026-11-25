// The agent picked in Preferences › AI agent, as settings.json holds it, and the model it runs each task with

export type AiAgent = 'claude' | 'codex' | 'opencode' | 'gemini' | 'copilot' | 'custom';
export type PresetAgent = Exclude<AiAgent, 'custom'>;

export const PRESET_AGENTS: PresetAgent[] = ['claude', 'codex', 'opencode', 'gemini', 'copilot'];

/** what an agent is asked to do */
export type AiTask = 'proofread' | 'refine' | 'convert';
/** chat is the Agent tab's starting model */
export type ModelTask = AiTask | 'chat';

/** Claude Code's models by alias, which follow its newest of each */
export const DEFAULT_AGENT_MODELS: Record<string, Record<string, string>> = {
	claude: { proofread: 'haiku', refine: 'sonnet', convert: 'opus' }
};

export function isAiAgent(v: unknown): v is AiAgent {
	return v === 'custom' || PRESET_AGENTS.includes(v as PresetAgent);
}

/** null with none picked or with AI turned off */
export function chosenAgent(s: Record<string, unknown>): AiAgent | null {
	return s.aiOff !== true && isAiAgent(s.agent) ? s.agent : null;
}

/** '' is the agent's own default */
export function agentModelOf(s: Record<string, unknown>, agent: AiAgent, task: ModelTask): string {
	const all = s.agentModels && typeof s.agentModels === 'object' ? (s.agentModels as Record<string, unknown>) : {};
	const own = all[agent] && typeof all[agent] === 'object' ? (all[agent] as Record<string, unknown>)[task] : '';
	return typeof own === 'string' ? own : '';
}
