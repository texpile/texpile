// Agent settings from before Refine and the Agent tab each offered a list, moved into the lists as the file is read:
// Refine's one agent and its model, and the tab turned off by name
function isRecord(v: unknown): v is Record<string, unknown> {
	return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function upgradeAgentSettings(stored: Record<string, unknown>): Record<string, unknown> {
	const { aiAgent, aiAgentModel, ...out } = stored;
	// '' is where every install started, Off left as it was: that reader is offered the agents installed, as a new one is
	if (typeof aiAgent === 'string' && aiAgent && !Array.isArray(out.refineAgents)) {
		out.refineAgents = [aiAgent];
		if (typeof aiAgentModel === 'string' && aiAgentModel)
			out.aiAgentModels = { [aiAgent]: aiAgentModel, ...(isRecord(out.aiAgentModels) ? out.aiAgentModels : {}) };
	}
	// the tab's off, though, was never where it started, only a choice, so it stays off
	if (out.agentPanel === 'off') {
		out.agentPanel = '';
		if (!Array.isArray(out.agentPanelAgents)) out.agentPanelAgents = [];
	}
	return out;
}
