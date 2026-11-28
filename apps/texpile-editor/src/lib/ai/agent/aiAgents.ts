// The agents every AI feature can use, what each is called, and where to get one
import { m } from '$lib/paraglide/messages';

export type AiAgent = 'claude' | 'codex' | 'opencode' | 'gemini' | 'copilot' | 'custom';
export type PresetAgent = Exclude<AiAgent, 'custom'>;

export const PRESET_AGENTS: PresetAgent[] = ['claude', 'codex', 'opencode', 'gemini', 'copilot'];
export const AI_AGENTS: AiAgent[] = [...PRESET_AGENTS, 'custom'];

/** chat is the Agent tab's starting model */
export type ModelTask = 'proofread' | 'refine' | 'convert' | 'chat';

export const INSTALL_PAGES: Record<PresetAgent, string> = {
	claude: 'https://code.claude.com/docs/en/setup',
	codex: 'https://developers.openai.com/codex/cli',
	opencode: 'https://opencode.ai/docs/',
	gemini: 'https://github.com/google-gemini/gemini-cli',
	copilot: 'https://github.com/github/copilot-cli'
};

export function isAiAgent(v: unknown): v is AiAgent {
	return AI_AGENTS.includes(v as AiAgent);
}

export function agentLabel(agent: AiAgent | ''): string {
	switch (agent) {
		case 'claude':
			return m.ai_agent_claude();
		case 'codex':
			return m.ai_agent_codex();
		case 'opencode':
			return m.ai_agent_opencode();
		case 'gemini':
			return m.ai_agent_gemini();
		case 'copilot':
			return m.ai_agent_copilot();
		default:
			return m.ai_agent_custom();
	}
}

/** what each one runs on, under its name in Preferences */
export function agentPlan(agent: AiAgent): string {
	switch (agent) {
		case 'claude':
			return m.ai_agent_claude_plan();
		case 'codex':
			return m.ai_agent_codex_plan();
		case 'opencode':
			return m.ai_agent_opencode_plan();
		case 'gemini':
			return m.ai_agent_gemini_plan();
		case 'copilot':
			return m.ai_agent_copilot_plan();
		default:
			return m.ai_agent_custom_plan();
	}
}

/** the name the panel uses for the running agent: a custom one goes by what it calls itself */
export function runningAgentName(agent: AiAgent | '', reported: string): string {
	return agent === 'custom' && reported ? reported : agentLabel(agent);
}

/** what to run in the terminal to sign in; null when Texpile cannot know */
export function signInCommand(agent: AiAgent | ''): string | null {
	const commands: Record<AiAgent, string | null> = {
		codex: 'codex login',
		claude: 'claude',
		opencode: 'opencode auth login',
		copilot: 'copilot',
		gemini: 'gemini',
		custom: null
	};
	return agent ? commands[agent] : null;
}
