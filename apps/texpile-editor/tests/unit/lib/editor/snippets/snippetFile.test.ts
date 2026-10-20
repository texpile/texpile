import { describe, expect, it } from 'vitest';
import { parseSnippetFile } from '$lib/editor/snippets/file/parseSnippetFile';
import { compileSnippets } from '$lib/editor/snippets/file/snippetRegistry';
import { getLocale, overwriteGetLocale } from '$lib/paraglide/runtime';

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

	it('gives a math snippet without a markdown body its latex one in Markdown, and a text one none', () => {
		const file = parseSnippetFile(
			'{ "v": 1, "snippets": { "M": { "prefix": "m", "context": "math", "body": { "latex": "\\\\frac", "typst": "frac" } }, "T": { "prefix": "t", "context": "text", "body": { "latex": "\\\\emph" } } } }',
			'global'
		);
		expect(file.snippets.find((s) => s.name === 'M')?.bodies.markdown).toBe('\\frac');
		expect(file.snippets.find((s) => s.name === 'T')?.bodies.markdown).toBeUndefined();
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

	it('warns, and still loads, a Typst auto trigger that is already a word of Typst math', () => {
		const { problems, languages } = compileSnippets({ global: null, project, allowedPatterns: null });
		expect(problems).toContainEqual(
			expect.objectContaining({ name: 'Differential', warning: true, reason: expect.stringContaining('"dif"') })
		);
		expect(languages.typst.auto.map((c) => c.snippet.name)).toContain('Differential');
	});

	it('counts what each file has in use, and the global entries a folder entry of the same name replaces', () => {
		const global = parseSnippetFile('{ "Set": { "prefix": "st", "body": "x" }, "Own": { "prefix": "own", "body": "y" } }', 'global');
		const { loaded } = compileSnippets({ global, project, allowedPatterns: null });
		expect(loaded).toEqual({ global: 1, project: 2, globalReplaced: 1 });
	});

	it('says where broken JSON breaks, as a line and column of the file, comments and all', () => {
		const broken = parseSnippetFile('{\n\t// mine\n\t"A": { "prefix": "a" "body": "x" }\n}', 'global');
		expect(broken.problems).toHaveLength(1);
		expect(broken.problems[0]).toMatchObject({ whole: true });
		expect(broken.problems[0].reason).toMatch(/^The file is not valid JSON: line 3, column \d+ \(/);
	});

	it("says what is wrong in the app's language", () => {
		const english = getLocale;
		overwriteGetLocale(() => 'de');
		try {
			const file = parseSnippetFile('{ "A": { "prefix": "a" }, "B": { "prefix": "b", "body": "x", "auto": "true" } }', 'global');
			expect(file.problems.map((p) => p.reason)).toEqual([
				'Hat keinen "body", also keinen Text zum Einfügen.',
				'"auto" muss true oder false sein, ohne Anführungszeichen.'
			]);
			expect(parseSnippetFile('[]', 'global').problems[0].reason).toBe('Die Datei muss mit { beginnen und mit } enden.');
		} finally {
			overwriteGetLocale(english);
		}
	});

	it('reports the same dropped entry once per package file', () => {
		const problem = (file: string) => ({ layer: 'project' as const, name: 'samename', reason: 'left out', file });
		const { problems } = compileSnippets({
			global: null,
			project: null,
			allowedPatterns: null,
			packageProblems: [problem('dupa.json'), problem('dupb.json'), problem('dupb.json')]
		});
		expect(problems.map((p) => p.file)).toEqual(['dupa.json', 'dupb.json']);
	});
});
