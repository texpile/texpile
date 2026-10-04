// Which agent Refine runs: the one picked in Preferences, and none until one is. One, as nobody switches agents for a
// rewrite. Until then Refine stays in the menus as the way to Preferences. Main runs only an agent this list allows
// (electron/src/ipc/agentIpc.ts)
import { settings } from '$lib/settings';
import { agentBridge, type PresetAgent, type RefineAgent } from './selectionRefiner';

let found = $state<Record<PresetAgent, boolean> | null>(null);

export const refineInstalled = {
	get found(): Record<PresetAgent, boolean> | null {
		return found;
	}
};

/** `again` for Preferences, where an agent may just have been installed */
export function lookUpRefineAgents(again = false): void {
	if (found && !again) return;
	void agentBridge()
		?.detect()
		.then((r) => (found = r))
		.catch(() => undefined);
}

/** none or one; a list saved when several could be ticked keeps its first */
export function refineAgentsTicked(): RefineAgent[] {
	return settings.current.refineAgents?.slice(0, 1) ?? [];
}

/** the ticked ones that can run: a preset not known to be missing, the custom one once it has a command */
export function refineAgentsOffered(): RefineAgent[] {
	return refineAgentsTicked().filter((a) => (a === 'custom' ? !!settings.current.aiAgentCommand.trim() : found?.[a] !== false));
}

/** the model a preset runs with; '' is its own default */
export function modelOf(agent: PresetAgent): string {
	return settings.current.aiAgentModels?.[agent] ?? '';
}
