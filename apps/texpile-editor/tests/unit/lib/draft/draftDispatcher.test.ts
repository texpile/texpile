// @vitest-environment jsdom
// Focus moving between editor groups on different files: each file keeps its own compiled baseline
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/workspace/workspaceStore', () => ({ workspaceRoot: { current: '/p' } }));
vi.mock('$lib/workspace/compilePipeline.svelte', () => ({ relFromRoot: (path: string) => path.slice(3) }));

const { DraftDispatcher } = await import('$lib/draft/draftDispatcher');

const doc = (body: string) =>
	['\\documentclass{article}', '\\begin{document}', body, '', 'Second paragraph here.', '\\end{document}', ''].join('\n');

function harness() {
	const files: Record<string, string> = { '/p/a.tex': doc('Alpha one two three.'), '/p/b.tex': doc('Beta four five six.') };
	let path = '/p/a.tex';
	const compiles = { full: 0, patches: 0 };
	const dispatcher = new DraftDispatcher({
		getSource: () => files[path],
		getLoadedPath: () => path,
		isActive: () => true,
		flushSaves: async () => {},
		triggerFullCompile: () => compiles.full++,
		getTarget: () => ({ instantPatch: () => compiles.patches++, focusAfterCompile: () => {} })
	});
	async function show(next: string) {
		path = next;
		dispatcher.run();
		await vi.runAllTimersAsync();
	}
	return { files, compiles, show };
}

describe('DraftDispatcher across files', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('does not recompile a file shown again unchanged since its compile', async () => {
		const { compiles, show } = harness();
		await show('/p/a.tex');
		await show('/p/b.tex');
		expect(compiles.full).toBe(2);
		await show('/p/a.tex');
		expect(compiles.full).toBe(2);
	});

	it('diffs an edit against the file it was made in', async () => {
		const { files, compiles, show } = harness();
		await show('/p/a.tex');
		await show('/p/b.tex');
		files['/p/a.tex'] = doc('Alpha one two three four.');
		await show('/p/a.tex');
		expect(compiles).toEqual({ full: 2, patches: 1 });
	});
});
