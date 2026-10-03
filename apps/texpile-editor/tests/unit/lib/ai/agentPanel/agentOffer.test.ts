// Which agents the Agent tab's menu offers: the ticked ones, else the ones installed; nothing ticked hides the tab
import { describe, it, expect, vi, beforeEach } from 'vitest';

const settings = {
	current: { agentPanelAgents: null as string[] | null, agentPanelCommand: '' }
};
vi.mock('$lib/settings', () => ({ settings }));
vi.mock('$lib/ai/agentPanel/installedAgents.svelte', () => ({
	installedAgents: { found: { codex: true, claude: true, opencode: false, copilot: false, gemini: true } }
}));
vi.mock('$lib/paraglide/messages', () => ({ m: {} }));

const { panelAgentsTicked, panelTabOff, withPanelAgent } = await import('$lib/ai/agentPanel/agentOffer.svelte');

beforeEach(() => {
	settings.current = { agentPanelAgents: null, agentPanelCommand: '' };
});

describe('Agent tab agents', () => {
	it('offers the installed agents, and a command of the reader own once there is one', () => {
		expect(panelAgentsTicked()).toEqual(['codex', 'claude', 'gemini']);
		settings.current.agentPanelCommand = 'my-acp';
		expect(panelAgentsTicked()).toEqual(['codex', 'claude', 'gemini', 'custom']);
		expect(panelTabOff()).toBe(false);
	});

	it('offers what is ticked, and nothing ticked hides the tab', () => {
		settings.current.agentPanelAgents = ['claude'];
		expect(panelAgentsTicked()).toEqual(['claude']);
		settings.current.agentPanelAgents = [];
		expect(panelTabOff()).toBe(true);
	});

	it('ticks and unticks in the order Preferences lists them', () => {
		settings.current.agentPanelAgents = ['gemini'];
		expect(withPanelAgent('codex', true)).toEqual(['codex', 'gemini']);
		expect(withPanelAgent('gemini', false)).toEqual([]);
	});
});
