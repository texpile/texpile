// The agent picked in Preferences › AI agent, which every AI feature uses, and which agents are on this computer
import { settings } from '$lib/settings';
import { agentBridge } from './agentBridge';
import type { AiAgent, ModelTask, PresetAgent } from './aiAgents';

let found = $state<Record<PresetAgent, boolean> | null>(null);

export const installedAgents = {
	get found(): Record<PresetAgent, boolean> | null {
		return found;
	}
};

/** `again` for Preferences, where an agent may just have been installed */
export function lookUpAgents(again = false): void {
	if (found && !again) return;
	void agentBridge()
		?.detect()
		.then((r) => (found = r))
		.catch(() => undefined);
}

/** null with AI turned off or none picked yet */
export function chosenAgent(): AiAgent | null {
	return settings.current.aiOff ? null : settings.current.agent || null;
}

/** the chosen one when it can run: a preset not known to be missing, the custom one once its command is filled in */
export function agentOffered(): AiAgent | null {
	const agent = chosenAgent();
	if (agent === 'custom') return settings.current.agentCommand.trim() ? agent : null;
	return agent && found?.[agent] !== false ? agent : null;
}

/** '' is the agent's own default */
export function modelOf(agent: AiAgent, task: ModelTask): string {
	return settings.current.agentModels[agent]?.[task] ?? '';
}

/** "Use AI features" switched off: every AI feature hidden */
export function aiTurnedOff(): boolean {
	return settings.current.aiOff;
}

const AUTHORS: Record<Exclude<AiAgent, 'custom'>, string> = {
	claude: 'Claude',
	codex: 'Codex',
	opencode: 'OpenCode',
	gemini: 'Gemini',
	copilot: 'Copilot'
};

/** the agent's name as the suggestion's author */
export function agentName(agent: AiAgent): string {
	if (agent !== 'custom') return AUTHORS[agent];
	// the program a custom command runs, without its folder or extension
	const program =
		settings.current.agentCommand
			.trim()
			.replace(/^["']/, '')
			.split(/["'\s]/)[0] ?? '';
	return (
		program
			.split(/[\\/]/)
			.pop()
			?.replace(/\.(exe|cmd|bat)$/i, '') || 'AI agent'
	);
}
