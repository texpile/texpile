// Settings from before one agent served every AI feature: Refine's agent wins, then the Agent tab's
import { it, expect, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/nowhere' } }));
const { upgradeAgentSettings } = await import('../../../../../electron/src/ai/agentSettingsUpgrade');

const DEFAULTS = { claude: { proofread: 'haiku', refine: 'sonnet', convertFast: 'haiku', convertStrong: 'opus' } };

it("takes Refine's agent, with agy's place going to Gemini, and its model as Refine's", () => {
	expect(
		upgradeAgentSettings({ refineAgents: ['agy'], agentPanel: 'claude', aiAgentModels: { claude: 'opus', agy: 'x' }, mcpPort: 0 })
	).toEqual({
		agent: 'gemini',
		agentModels: { claude: { ...DEFAULTS.claude, refine: 'opus' } },
		mcpPort: 0
	});
	// the custom service has no place left, so the Agent tab's agent and its command carry over
	expect(
		upgradeAgentSettings({ refineAgents: ['service'], aiServiceUrl: 'http://x', agentPanel: 'custom', agentPanelCommand: 'goose acp' })
	).toEqual({
		agent: 'custom',
		agentCommand: 'goose acp',
		agentModels: DEFAULTS
	});
});

it('turns AI off where Refine and the Agent tab were both turned off, and leaves an upgraded file be', () => {
	expect(upgradeAgentSettings({ refineAgents: [], agentPanelAgents: [] })).toMatchObject({ agent: '', aiOff: true });
	expect(upgradeAgentSettings({ refineAgents: [], agentPanel: 'codex' })).toMatchObject({ agent: 'codex' });
	expect(upgradeAgentSettings({ agent: 'codex', mcpPort: 0 })).toEqual({ agent: 'codex', mcpPort: 0 });
});
