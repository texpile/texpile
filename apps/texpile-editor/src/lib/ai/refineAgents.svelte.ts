// Which AI service Refine runs: the one picked in Preferences, and none until one is. One, as nobody switches agents for a
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

/** None picked in Preferences, or all AI turned off: Refine is in no menu. null is nothing picked yet */
export function refineTurnedOff(): boolean {
	return settings.current.aiOff || settings.current.refineAgents?.length === 0;
}

/** none or one; a list saved when several could be ticked keeps its first */
export function refineAgentsTicked(): RefineAgent[] {
	return settings.current.refineAgents?.slice(0, 1) ?? [];
}

function canRun(a: RefineAgent): boolean {
	const s = settings.current;
	if (a === 'custom') return !!s.aiAgentCommand.trim();
	if (a === 'service') return !!s.aiServiceUrl.trim() && !!s.aiServiceModel.trim();
	return found?.[a] !== false;
}

/** the ticked ones that can run: a preset not known to be missing, the custom command or service once it is filled in */
export function refineAgentsOffered(): RefineAgent[] {
	if (settings.current.aiOff) return [];
	return refineAgentsTicked().filter(canRun);
}

/** Claude Code, Codex and the custom service can look at a picture */
export function imageReaderOffered(): boolean {
	const a = refineAgentsOffered()[0];
	return a === 'claude' || a === 'codex' || a === 'service';
}

/** the model a preset runs with; '' is its own default */
export function modelOf(agent: PresetAgent): string {
	return settings.current.aiAgentModels?.[agent] ?? '';
}
