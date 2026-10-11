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
		const global = parseSnippetFile(PROJECT, 'global');
		expect(names(compileSnippets({ global, project: null, allowedPatterns: null }).languages.latex.auto)).toContain('Subscript');
	});

	it('asks again when the project changes a variable that a global pattern uses', () => {
		const global = parseSnippetFile(
			'{ "v": 1, "snippets": { "Greek": { "prefix": "${GREEK}x", "regex": true, "auto": true, "body": "[[0]]" } } }',
			'global'
		);
		const projectWith = (greek: string) => parseSnippetFile(`{ "v": 1, "variables": { "GREEK": "${greek}" }, "snippets": {} }`, 'project');
		const first = compileSnippets({ global, project: projectWith('a'), allowedPatterns: null });
		expect(first.pendingPatterns).toBe('(?:a)x');
		expect(names(first.languages.latex.auto)).not.toContain('Greek');
		const allowed = compileSnippets({ global, project: projectWith('a'), allowedPatterns: first.pendingPatterns });
		expect(names(allowed.languages.latex.auto)).toContain('Greek');
		const pulled = compileSnippets({ global, project: projectWith('(a+)+b'), allowedPatterns: first.pendingPatterns });
		expect(pulled.pendingPatterns).toBe('(?:(a+)+b)x');
		expect(names(pulled.languages.latex.auto)).not.toContain('Greek');
	});

	it('skips a pattern without auto with a note, and does not ask to allow it', () => {
		const lazy = parseSnippetFile('{ "v": 1, "snippets": { "Lazy": { "prefix": "(a+)+b", "regex": true, "body": "x" } } }', 'project');
		const { pendingPatterns, problems } = compileSnippets({ global: null, project: lazy, allowedPatterns: null });
		expect(pendingPatterns).toBeNull();
		expect(problems).toContainEqual(expect.objectContaining({ name: 'Lazy', reason: expect.stringContaining('"auto": true') }));
	});

	it('warns when a Typst auto trigger is already a Typst name', () => {
		const { problems } = compileSnippets({ global: null, project, allowedPatterns: null });
		expect(problems).toContainEqual(
			expect.objectContaining({ name: 'Differential', reason: expect.stringContaining('"dif" is already a Typst name') })
		);
	});
});
