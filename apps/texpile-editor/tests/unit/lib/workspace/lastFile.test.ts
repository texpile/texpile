// @vitest-environment jsdom
// Restoring the last-open file per workspace: the remembered path has to come back in a form the
// rest of the app can compare against, not merely one the filesystem will accept. And the tabs
// around it, comparisons included, with the one that was focused.
import { describe, expect, it, beforeEach } from 'vitest';
import { savedLastFile, savedLastCompare, setLastFile } from '$lib/workspace/workspaceStore';
import { tabs } from '$lib/workspace/tabs.svelte';

describe('savedLastFile', () => {
	beforeEach(() => localStorage.clear());

	// What the OS directory scan hands the file tree: the root's own separator throughout.
	const treePath = (root: string, rel: string) => (root.includes('\\') ? `${root}\\${rel.split('/').join('\\')}` : `${root}/${rel}`);

	it.each([
		['C:\\dev\\proj', 'main.tex'],
		['C:\\dev\\proj', 'sub/ch1.tex'],
		['/home/u/proj', 'main.tex'],
		['/home/u/proj', 'sub/ch1.tex']
	])('round-trips %s + %s in the tree\u2019s own path form', (root, rel) => {
		const abs = treePath(root, rel);
		setLastFile(root, abs, null);
		// Strict equality on purpose. It used to come back "C:/dev/proj\main.tex" -- the root
		// forward-slashed, the tail backslash-joined -- which every fs call accepts and no string
		// comparison matches, so the restored file never highlighted as open in the tree.
		expect(savedLastFile(root)).toBe(abs);
	});

	it('returns null for a folder it has never recorded', () => {
		expect(savedLastFile('C:\\dev\\other')).toBeNull();
	});

	it('keeps a separate entry per workspace', () => {
		setLastFile('C:\\a', 'C:\\a\\one.tex', null);
		setLastFile('C:\\b', 'C:\\b\\two.tex', null);
		expect(savedLastFile('C:\\a')).toBe('C:\\a\\one.tex');
		expect(savedLastFile('C:\\b')).toBe('C:\\b\\two.tex');
	});

	it('ignores a file that is not under the root, rather than recording a cross-root path', () => {
		setLastFile('C:\\a', 'C:\\elsewhere\\stray.tex', null);
		expect(savedLastFile('C:\\a')).toBeNull();
	});
});

describe('reopening a folder with comparisons open', () => {
	beforeEach(() => localStorage.clear());

	const V1 = { hash: 'aaa111', subject: 'First draft' };

	it('brings the comparison tabs back beside the files, in order', () => {
		tabs.bind('C:\\p', true);
		tabs.noteOpened('C:\\p\\main.tex');
		tabs.keep('C:\\p\\main.tex');
		tabs.openCompare('C:\\p\\ch\\one.tex', V1);
		tabs.bind('C:\\p', true);
		expect(tabs.list).toEqual([{ path: 'C:\\p\\main.tex' }, { path: 'C:\\p\\ch\\one.tex', compare: V1 }]);
	});

	it("leaves a comparison against an agent's before text closed: that text was only in memory", () => {
		tabs.bind('C:\\p', true);
		tabs.noteOpened('C:\\p\\main.tex');
		tabs.keep('C:\\p\\main.tex');
		tabs.openCompare('C:\\p\\main.tex', { hash: 'agent:1:C:\\p\\main.tex', subject: 'Before Codex' });
		tabs.bind('C:\\p', true);
		expect(tabs.list).toEqual([{ path: 'C:\\p\\main.tex' }]);
	});

	// a parent repository's file, compared from Source Control; the restore can only join paths under the root
	it('leaves a tab outside the folder closed rather than reopening it under the folder', () => {
		tabs.bind('C:\\p', true);
		tabs.noteOpened('C:\\p\\main.tex');
		tabs.keep('C:\\p\\main.tex');
		tabs.openCompare('C:\\shared\\notes.tex', V1);
		tabs.openCompare('C:\\p2\\other.tex', V1);
		tabs.bind('C:\\p', true);
		expect(tabs.list).toEqual([{ path: 'C:\\p\\main.tex' }]);
	});

	it('lands on the focused comparison only while its tab is still there', () => {
		tabs.bind('C:\\p', true);
		const key = tabs.openCompare('C:\\p\\main.tex', V1);
		setLastFile('C:\\p', 'C:\\p\\main.tex', V1);
		expect(savedLastCompare('C:\\p')).toEqual(V1);
		// landing on it now would put a diff on screen with no tab to close it by
		tabs.close(key);
		expect(savedLastCompare('C:\\p')).toBeNull();
	});
});
