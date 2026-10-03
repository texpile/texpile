// Which agents Refine offers, each its own entry in the right-click menu: the ones ticked in Preferences, and until
// anything is ticked there, the ones installed. Main runs only an agent this list allows (electron/src/ipc/agentIpc.ts)
import { settings } from '$lib/settings';
import { agentBridge, PRESET_AGENTS, type PresetAgent, type RefineAgent } from './selectionRefiner';

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

// a function, not a constant: this module and selectionRefiner import each other
function order(): RefineAgent[] {
	return [...PRESET_AGENTS, 'custom'];
}

export function refineAgentsTicked(): RefineAgent[] {
	const { refineAgents } = settings.current;
	if (refineAgents) return refineAgents;
	return PRESET_AGENTS.filter((a) => !!found?.[a]);
}

/** the ticked ones that can run: a preset not known to be missing, the custom one once it has a command */
export function refineAgentsOffered(): RefineAgent[] {
	return refineAgentsTicked().filter((a) => (a === 'custom' ? !!settings.current.aiAgentCommand.trim() : found?.[a] !== false));
}

/** the ticked list with one agent ticked or not, in the order Preferences lists them */
export function withRefineAgent(agent: RefineAgent, on: boolean): RefineAgent[] {
	const now = new Set(refineAgentsTicked());
	if (on) now.add(agent);
	else now.delete(agent);
	return order().filter((a) => now.has(a));
}

/** the model a preset runs with; '' is its own default */
export function modelOf(agent: PresetAgent): string {
	return settings.current.aiAgentModels?.[agent] ?? '';
}
