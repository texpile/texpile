/** @vitest-environment jsdom */
// Which agents Refine offers: the ticked ones, else the ones installed
import { describe, it, expect, vi, beforeEach } from 'vitest';

const settings = {
	current: {
		refineAgents: null as string[] | null,
		aiAgentCommand: ''
	}
};
vi.mock('$lib/settings', () => ({ settings }));
(globalThis as { texpileAgent?: unknown }).texpileAgent = {
	detect: async () => ({ claude: true, codex: false, agy: true })
};

const { lookUpRefineAgents, refineAgentsTicked, refineAgentsOffered, withRefineAgent } = await import('$lib/ai/refineAgents.svelte');

beforeEach(async () => {
	settings.current = { refineAgents: null, aiAgentCommand: '' };
	lookUpRefineAgents();
	await new Promise((r) => setTimeout(r, 0));
});

describe('refine agents', () => {
	it('offers the installed presets until any are ticked', () => {
		expect(refineAgentsTicked()).toEqual(['claude', 'agy']);
		expect(refineAgentsOffered()).toEqual(['claude', 'agy']);
	});

	it('offers only the ticked ones that can run', () => {
		settings.current.refineAgents = ['codex', 'claude', 'custom'];
		expect(refineAgentsOffered()).toEqual(['claude']);
		settings.current.aiAgentCommand = 'my-agent --quiet';
		expect(refineAgentsOffered()).toEqual(['claude', 'custom']);
	});

	it('ticks and unticks in the order Preferences lists them', () => {
		settings.current.refineAgents = ['agy'];
		expect(withRefineAgent('claude', true)).toEqual(['claude', 'agy']);
		expect(withRefineAgent('agy', false)).toEqual([]);
	});
});
