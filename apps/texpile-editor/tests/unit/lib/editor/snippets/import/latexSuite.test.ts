import { describe, expect, it } from 'vitest';
import { convertLatexSuite, suiteBody } from '$lib/editor/snippets/import/latexSuite';
import { insertSnippetEntries } from '$lib/editor/snippets/import/insertSnippetEntries';
import { parseSnippetFile } from '$lib/editor/snippets/file/parseSnippetFile';
import { toPlainText } from '$lib/editor/snippets/expand/bodyTemplate';

// the shape of LaTeX Suite's own default snippets
const SUITE = String.raw`[
	// Math mode
	{trigger: "mk", replacement: "$$0$", options: "tA"},
	{trigger: "beg", replacement: "\\begin{$0}\n$1\n\\end{$0}", options: "mA"},
	{trigger: "([A-Za-z])(\\d)", replacement: "[[0]]_{[[1]]}", options: "rmA", description: "Auto letter subscript", priority: -1},
	{trigger: /([^\\])(exp|log|ln)/, replacement: "[[0]]\\[[1]]", options: "rmA"},
	{trigger: "U", replacement: "\\underbrace{ §{VISUAL} }_{ $0 }", options: "mv"},
	{trigger: /iden(\d)/, replacement: (match) => {
		const n = match[1];
		return "\\begin{pmatrix}" + n + "\\end{pmatrix}";
	}, options: "mA", description: "N x N identity matrix"},
	{trigger: "cases", replacement: "\\begin{cases}\n$0 \\\\\n\\end{cases}", options: "MA"},
	{trigger: "code", replacement: "x", options: "cA"},
]`.replaceAll('§', '$');

describe('importing LaTeX Suite snippets', () => {
	it('carries over what it can, into a file that keeps its comments', () => {
		const { entries, skipped } = convertLatexSuite(SUITE);
		expect(skipped).toEqual([
			{ name: 'N x N identity matrix', reason: 'its replacement is a function, which only Obsidian can run' },
			{ name: 'code', reason: 'works in code blocks only' }
		]);
		const before = '{\n\t// mine\n\t"v": 1,\n\t"snippets": {\n\t\t"mk": { "prefix": "mk", "body": "mine" }\n\t}\n}\n';
		const file = parseSnippetFile(insertSnippetEntries(before, entries), 'project');
		expect(file.problems).toEqual([]);
		const byName = new Map(file.snippets.map((s) => [s.name, s]));
		expect(byName.get('mk')!.bodies.latex).toBe('mine');
		expect(byName.get('beg')).toMatchObject({ context: 'math', auto: true, bodies: { latex: '\\begin{$1}\n$2\n\\end{$1}' } });
		expect(byName.get('Auto letter subscript')).toMatchObject({ regex: true, priority: -1, prefixes: ['([A-Za-z])(\\d)'] });
		expect(byName.get('([^\\\\])(exp|log|ln)')).toMatchObject({ regex: true, prefixes: ['([^\\\\])(exp|log|ln)'] });
		expect(byName.get('U')).toMatchObject({ prefixes: [], auto: false, bodies: { latex: '\\underbrace{ ${TM_SELECTED_TEXT} }_{ $1 }' } });
		expect(byName.get('cases')!.context).toBe('display-math');
	});

	it('a replacement reads back as written, line breaks and dollar signs included', () => {
		const latex = String.raw`a \\ b \$ c \} d`;
		expect(toPlainText(suiteBody(latex))).toBe(latex);
		expect(suiteBody(String.raw`\frac{$0}{$1}$2`)).toBe(String.raw`\frac{$1}{$2}$3`);
	});
});
