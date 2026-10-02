import { it, expect } from 'vitest';
import { attachedBlocks, selectedLines } from '$lib/ai/agentPanel/attach/attached';
import { runsCommand } from '$lib/ai/agentPanel/slashMatch';

it('sends a selection as its lines and text, a file as a link, and a command alone', () => {
	const source = 'one\ntwo\nthree\nfour\n';
	// to the start of "four": the line the selection only touches is left out
	const lines = selectedLines(source, source.indexOf('two'), source.indexOf('four'));
	expect(lines).toEqual({ first: 2, last: 3, text: 'two\nthree\n' });
	expect(attachedBlocks({ path: 'C:\\paper #1\\main.tex', lines })).toEqual([
		{ type: 'resource', resource: { uri: 'file:///C:/paper%20%231/main.tex#L2:3', text: 'two\nthree\n' } }
	]);
	expect(attachedBlocks({ path: '/p/main.tex', lines: null })).toEqual([
		{ type: 'resource_link', uri: 'file:///p/main.tex', name: 'main.tex' }
	]);
	const commands = [{ name: 'compact', description: '', hint: null }];
	expect(runsCommand('/compact keep the intro', commands)).toBe(true);
	expect(runsCommand('/usr/bin is where it is', commands)).toBe(false);
});
