// Settings from before the agent lists: an agent the reader picked carries over, as does the Agent tab turned off
import { it, expect } from 'vitest';
import { upgradeAgentSettings } from '../../../../../electron/src/ai/agentSettingsUpgrade';

it('offers the installed agents to a reader still on the Off every install began with, and keeps a picked one', () => {
	expect(upgradeAgentSettings({ aiAgent: '', aiAgentModel: '' })).toEqual({});
	expect(upgradeAgentSettings({ aiAgent: 'codex', aiAgentModel: 'gpt-5' })).toEqual({
		refineAgents: ['codex'],
		aiAgentModels: { codex: 'gpt-5' }
	});
	// a file from before Refine, or one already upgraded, is left to the defaults and the lists
	expect(upgradeAgentSettings({ mcpPort: 0 })).toEqual({ mcpPort: 0 });
	expect(upgradeAgentSettings({ refineAgents: ['agy'], aiAgentModels: { agy: 'x' } })).toEqual({
		refineAgents: ['agy'],
		aiAgentModels: { agy: 'x' }
	});
});

it('keeps an Agent tab turned off by name off', () => {
	expect(upgradeAgentSettings({ agentPanel: 'off' })).toEqual({ agentPanel: '', agentPanelAgents: [] });
	expect(upgradeAgentSettings({ agentPanel: 'claude' })).toEqual({ agentPanel: 'claude' });
});
