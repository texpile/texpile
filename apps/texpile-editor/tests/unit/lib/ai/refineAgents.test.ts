/** @vitest-environment jsdom */
// Which agent Refine runs: the one picked, and none before that
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

const { lookUpRefineAgents, refineAgentsTicked, refineAgentsOffered } = await import('$lib/ai/refineAgents.svelte');

beforeEach(async () => {
	settings.current = { refineAgents: null, aiAgentCommand: '' };
	lookUpRefineAgents();
	await new Promise((r) => setTimeout(r, 0));
});

describe('refine agents', () => {
	it('runs none until one is picked, though some are installed', () => {
		expect(refineAgentsTicked()).toEqual([]);
		expect(refineAgentsOffered()).toEqual([]);
		settings.current.refineAgents = ['claude'];
		expect(refineAgentsOffered()).toEqual(['claude']);
	});

	it('keeps the first of a list saved when several could be ticked, and offers it only when it can run', () => {
		settings.current.refineAgents = ['codex', 'claude'];
		expect(refineAgentsTicked()).toEqual(['codex']);
		expect(refineAgentsOffered()).toEqual([]);
		settings.current.refineAgents = ['custom'];
		expect(refineAgentsOffered()).toEqual([]);
		settings.current.aiAgentCommand = 'my-agent --quiet';
		expect(refineAgentsOffered()).toEqual(['custom']);
	});

	it('is off when None is picked', () => {
		settings.current.refineAgents = [];
		expect(refineAgentsOffered()).toEqual([]);
	});
});
