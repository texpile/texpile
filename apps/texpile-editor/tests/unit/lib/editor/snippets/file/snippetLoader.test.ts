import { describe, expect, it } from 'vitest';
import { allowProjectSnippetPatterns, reloadSnippets, setFolderSnippetsOn } from '$lib/editor/snippets/file/snippetLoader';
import { snippetRegistry } from '$lib/editor/snippets/file/snippetRegistry';

const names = () => snippetRegistry().languages.latex.popup.map((c) => c.snippet.name);

const hostFile = (body: string) =>
	JSON.stringify({
		v: 1,
		snippets: {
			Revised: { scope: 'latex', prefix: 'rv', body: '\\rev{$1}' },
			Subscript: { prefix: '([A-Za-z])(\\d)', regex: true, auto: true, context: 'math', body: { latex: body } }
		}
	});

describe("a guest's folder snippets", () => {
	it("are the host's file, with its patterns waiting for the guest's own yes, which holds while the file changes elsewhere", async () => {
		await reloadSnippets(null, hostFile('[[0]]_{[[1]]}'));
		expect(names()).toContain('Revised');
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
		expect(names()).not.toContain('Revised');
		setFolderSnippetsOn(null, true);
		await new Promise((r) => setTimeout(r));
		expect(names()).toContain('Revised');
	});
});

describe('a snippet file saved half typed', () => {
	it('keeps its last version that loaded, and says so', async () => {
		await reloadSnippets(null, hostFile('[[0]]_{[[1]]}'));
		await reloadSnippets(null, '{ "v": 1, "snippets": { "Revised": { "scope": "latex" "prefix": "rv" } } }');
		expect(names()).toContain('Revised');
		expect(snippetRegistry().problems).toEqual([expect.objectContaining({ layer: 'project', whole: true, kept: true })]);
	});
});
