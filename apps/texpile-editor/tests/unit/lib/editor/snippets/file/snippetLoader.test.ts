import { describe, expect, it } from 'vitest';
import { allowProjectSnippetPatterns, reloadSnippets, setFolderSnippetsOn } from '$lib/editor/snippets/file/snippetLoader';
import { snippetRegistry } from '$lib/editor/snippets/file/snippetRegistry';

const hostFile = (body: string) =>
	JSON.stringify({
		v: 1,
		snippets: {
			Revised: { scope: 'latex', wrap: 'rev' },
			Subscript: { prefix: '([A-Za-z])(\\d)', regex: true, auto: true, context: 'math', body: { latex: body } }
		}
	});

describe("a guest's folder snippets", () => {
	it("are the host's file, with its patterns waiting for the guest's own yes, which holds while the file changes elsewhere", async () => {
		await reloadSnippets(null, hostFile('[[0]]_{[[1]]}'));
		expect(snippetRegistry().languages.latex.wraps.map((c) => c.snippet.wrap)).toContain('rev');
		const pending = snippetRegistry().pendingPatterns;
		expect(pending).toBeTruthy();
		allowProjectSnippetPatterns(null, pending!);
		expect(snippetRegistry().pendingPatterns).toBeNull();
		await reloadSnippets(null, hostFile('[[0]]_[[1]]'));
		expect(snippetRegistry().pendingPatterns).toBeNull();
	});

	it('can be turned off by the guest, and on again', async () => {
		await reloadSnippets(null, hostFile('[[0]]_{[[1]]}'));
		setFolderSnippetsOn(null, false);
		await new Promise((r) => setTimeout(r));
		expect(snippetRegistry().languages.latex.wraps.map((c) => c.snippet.wrap)).not.toContain('rev');
		setFolderSnippetsOn(null, true);
		await new Promise((r) => setTimeout(r));
		expect(snippetRegistry().languages.latex.wraps.map((c) => c.snippet.wrap)).toContain('rev');
	});
});

describe('a snippet file saved half typed', () => {
	it('keeps its last version that loaded, and says so', async () => {
		await reloadSnippets(null, hostFile('[[0]]_{[[1]]}'));
		await reloadSnippets(null, '{ "v": 1, "snippets": { "Revised": { "scope": "latex" "wrap": "rev" } } }');
		expect(snippetRegistry().languages.latex.wraps.map((c) => c.snippet.wrap)).toContain('rev');
		expect(snippetRegistry().problems).toEqual([expect.objectContaining({ layer: 'project', whole: true, kept: true })]);
	});
});
