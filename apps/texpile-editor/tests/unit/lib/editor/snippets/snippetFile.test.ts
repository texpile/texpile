// what a snippet file contributes once read: comments and trailing commas allowed, a later layer
// over an earlier one, a cloned project's patterns held back, a Typst name warned about
import { describe, expect, it } from 'vitest';
import { parseSnippetFile } from '$lib/editor/snippets/file/parseSnippetFile';
import { compileSnippets } from '$lib/editor/snippets/file/snippetRegistry';

const PROJECT = `{
	// the team's
	"v": 1,
	"snippets": {
		"@a": { "disabled": true },
		"Set": { "prefix": "set", "body": "\\\\{ $1 ,}", },
		"Subscript": { "prefix": "([a-z])(\\\\d)", "regex": true, "auto": true, "body": "[[0]]_[[1]]" },
		"Differential": { "prefix": "dif", "auto": true, "context": "math", "body": { "typst": "(dif $1)/(dif $2)" } },
	},
}`;

describe('snippet files', () => {
	const project = parseSnippetFile(PROJECT, 'project');
	const names = (list: { snippet: { name: string } }[]) => list.map((c) => c.snippet.name);

	it('reads JSONC, keeps text that looks like JSON syntax, and turns off a built-in by name', () => {
		expect(project.problems).toEqual([]);
		expect(project.snippets.find((s) => s.name === 'Set')?.bodies.latex).toBe('\\{ $1 ,}');
		const { languages } = compileSnippets({ global: null, project, allowedPatterns: null });
		expect(names(languages.latex.popup)).toContain('Set');
		expect(names(languages.latex.popup)).not.toContain('@a');
		expect(names(languages.latex.popup)).toContain('@b');
	});

	it('holds a project pattern back until this machine allows it as it stands', () => {
		const held = compileSnippets({ global: null, project, allowedPatterns: null });
		expect(held.pendingPatterns).toBe('([a-z])(\\d)');
		expect(names(held.languages.latex.auto)).not.toContain('Subscript');
		const allowed = compileSnippets({ global: null, project, allowedPatterns: held.pendingPatterns });
		expect(allowed.pendingPatterns).toBeNull();
		expect(names(allowed.languages.latex.auto)).toContain('Subscript');
		// the same patterns from the global file need no allowing
		const global = parseSnippetFile(PROJECT, 'global');
		expect(names(compileSnippets({ global, project: null, allowedPatterns: null }).languages.latex.auto)).toContain('Subscript');
	});

	it('warns when a Typst auto trigger is already a Typst name', () => {
		const { problems } = compileSnippets({ global: null, project, allowedPatterns: null });
		expect(problems).toContainEqual(
			expect.objectContaining({ name: 'Differential', reason: expect.stringContaining('"dif" is already a Typst name') })
		);
	});
});
