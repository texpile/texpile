// The agent picked in Preferences for Refine, as settings.json holds it, and its model

/** the agent Refine may run, as the renderer's refineAgents.svelte.ts reads it: the one picked, none before that */
export function refineAgentsAllowed(s: Record<string, unknown>): string[] {
	if (s.aiOff === true) return [];
	return Array.isArray(s.refineAgents) ? s.refineAgents.filter((a): a is string => typeof a === 'string').slice(0, 1) : [];
}

/** a preset's model; '' is its own default */
export function agentModelOf(s: Record<string, unknown>, agent: string): string {
	const own = s.aiAgentModels && typeof s.aiAgentModels === 'object' ? (s.aiAgentModels as Record<string, unknown>)[agent] : '';
	return typeof own === 'string' ? own : '';
}
