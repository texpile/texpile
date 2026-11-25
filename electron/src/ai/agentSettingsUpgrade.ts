// Agent settings from before Refine and the Agent tab each offered a list, moved into the lists as the file is read:
// Refine's one agent and its model, the tab turned off by name, and proofreading's own Anthropic or OpenAI service
function isRecord(v: unknown): v is Record<string, unknown> {
	return !!v && typeof v === 'object' && !Array.isArray(v);
}

function text(v: unknown): string {
	return typeof v === 'string' ? v : '';
}

const OLD_SERVICE_SETTINGS = ['aiService', 'aiAnthropicModel', 'aiOpenAiUrl', 'aiOpenAiModel'];

/** the service proofreading used before one AI service served all three, as the custom service. Its key moves in
 *  ai/service/serviceKey.ts */
function proofreadService(old: Record<string, unknown>, agents: unknown): Record<string, unknown> {
	const { aiService, aiAnthropicModel, aiOpenAiUrl, aiOpenAiModel } = old;
	const anthropic = aiService === 'anthropic' && (old.proofreadAi === true || !!text(aiAnthropicModel));
	const openai = aiService === 'openai' && !!text(aiOpenAiUrl);
	if (!anthropic && !openai) return {};
	// a reader with an agent keeps it; one who proofread with a key and picked no agent keeps proofreading
	const keepsAgent = Array.isArray(agents) && agents.length > 0;
	return {
		aiServiceUrl: anthropic ? 'https://api.anthropic.com/v1' : text(aiOpenAiUrl),
		aiServiceModel: anthropic ? text(aiAnthropicModel) || 'claude-haiku-5-5' : text(aiOpenAiModel),
		...(old.proofreadAi === true && !keepsAgent ? { refineAgents: ['service'] } : {})
	};
}

export function upgradeAgentSettings(stored: Record<string, unknown>): Record<string, unknown> {
	const { aiAgent, aiAgentModel, ...out } = stored;
	for (const old of OLD_SERVICE_SETTINGS) delete out[old];
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
	return 'aiServiceUrl' in out ? out : { ...out, ...proofreadService(stored, out.refineAgents) };
}
