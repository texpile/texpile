// What each agent is called in the panel, and how a reader signs it in. Texpile never handles the
// sign-in itself: the agent's own program does, in the terminal
import { m } from '$lib/paraglide/messages';
import type { PanelAgent, PresetPanelAgent } from './agentPanel.types';

export const PANEL_PRESETS: PresetPanelAgent[] = ['codex', 'claude', 'opencode', 'copilot', 'gemini'];

export function agentLabel(agent: string): string {
	switch (agent) {
		case 'codex':
			return m.agent_panel_agent_codex();
		case 'claude':
			return m.agent_panel_agent_claude();
		case 'opencode':
			return m.agent_panel_agent_opencode();
		case 'copilot':
			return m.agent_panel_agent_copilot();
		case 'gemini':
			return m.agent_panel_agent_gemini();
		default:
			return m.agent_panel_agent_custom();
	}
}

/** the name the panel uses for the running agent: a custom one goes by what it calls itself */
export function runningAgentName(agent: string, reported: string): string {
	return agent === 'custom' && reported ? reported : agentLabel(agent);
}

/** what to run in the terminal to sign in; null when the panel cannot know */
export function signInCommand(agent: PanelAgent | ''): string | null {
	const commands: Record<PanelAgent, string | null> = {
		codex: 'codex login',
		claude: 'claude',
		opencode: 'opencode auth login',
		copilot: 'copilot',
		gemini: 'gemini',
		custom: null
	};
	return agent ? commands[agent] : null;
}
