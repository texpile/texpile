import { describe, expect, it } from 'vitest';
import { allowProjectSnippetPatterns, reloadSnippets } from '$lib/editor/snippets/file/snippetLoader';
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
});
