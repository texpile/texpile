// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { SelectionRefiner } from '$lib/ai/selectionRefiner';
import { REFINE_ACTIONS } from '$lib/ai/refineActions';

it('puts no suggestion in a copy of the file the reader switched to while the agent worked', async () => {
	const paper = '\\section{Intro}\nWe show that the method works well on every dataset we tried.\nMore text follows here.\n';
	let open = '/p/main.tex';
	const made: string[] = [];
	(globalThis as { texpileAgent?: unknown }).texpileAgent = {
		run: async () => {
			open = '/p/main_v1.tex';
			return { ok: true, text: 'The method works on every dataset we tried.' };
		},
		cancel: () => {}
	};
	const refiner = new SelectionRefiner({
		selection: () => ({ from: paper.indexOf('We show'), to: paper.indexOf('\nMore') }),
		activeText: () => paper,
		path: () => open,
		canSuggest: () => true,
		suggestAs: async () => {
			made.push(open);
			return 'id';
		},
		reveal: () => {}
	});
	await refiner.refine(
		REFINE_ACTIONS.find((a) => a.id === 'shorten')!,
		'claude'
	);
	expect(made).toEqual([]);
});

it('leaves the menus once None is picked or all AI is off, and leads to Preferences until anything is picked', async () => {
	const { updateSettings } = await import('$lib/settings');
	(globalThis as { texpileAgent?: unknown }).texpileAgent = { run: async () => ({ ok: true, text: '' }), cancel: () => {} };
	const refiner = new SelectionRefiner({
		selection: () => null,
		activeText: () => '',
		path: () => '/p/main.tex',
		canSuggest: () => true,
		suggestAs: async () => 'id',
		reveal: () => {}
	});
	updateSettings({ refineAgents: null });
	expect(refiner.needsAgent).toBe(true);
	updateSettings({ refineAgents: [] });
	expect([refiner.needsAgent, refiner.available]).toEqual([false, false]);
	updateSettings({ refineAgents: ['custom'], aiAgentCommand: 'ollama run llama3.1', aiOff: true });
	expect([refiner.needsAgent, refiner.available]).toEqual([false, false]);
	updateSettings({ aiOff: false });
	expect(refiner.available).toBe(true);
});
