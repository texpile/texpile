import { describe, expect, it } from 'vitest';
import { EditorState, type Transaction } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { parseMarkdownFile, serializeMarkdownFile } from '$lib/languages/markdown/visual/roundtrip';
import { makeDisplay, makeInline, setDisplayKind } from '$lib/editor/visual/extensions/mathlivebridge/mathMenu/mathFormulaType';
import { formulaItems } from '$lib/editor/visual/extensions/mathlivebridge/mathMenu/mathFormulaItems';

type Dialect = { parse: typeof parseLatexFile; serialize: typeof serializeLatexFile };
const latex: Dialect = { parse: parseLatexFile, serialize: serializeLatexFile };
const typst: Dialect = { parse: parseTypstFile, serialize: serializeTypstFile };
const markdown: Dialect = { parse: parseMarkdownFile, serialize: serializeMarkdownFile };

function posOf(doc: Node, type: string): number {
	let at = -1;
	doc.descendants((node, pos) => {
		if (at < 0 && node.type.name === type) at = pos;
	});
	return at;
}

/** the source after `change` on the first `type` node, and the doc it leaves */
function edit(dialect: Dialect, source: string, type: string, change: (state: EditorState, pos: number) => Transaction | null) {
	const parsed = dialect.parse(source);
	const state = EditorState.create({ doc: parsed.doc });
	const tr = change(state, posOf(state.doc, type));
	expect(tr).not.toBeNull();
	return { source: dialect.serialize(parsed, tr!.doc), doc: tr!.doc };
}

describe('changing an equation between inline and displayed', () => {
	it('keeps a LaTeX display inside the paragraph it was set from, and back', () => {
		const src = '\\documentclass{article}\n\\begin{document}\nBefore $x^2$ after.\n\\end{document}\n';
		const display = edit(latex, src, 'inline_math', makeDisplay);
		expect(display.source).not.toMatch(/\\par|\n\n/);
		const inline = edit(latex, display.source, 'block_math', makeInline);
		expect(inline.source).toBe(src);
	});

	it('sets a Typst formula on a line of its own, and back', () => {
		const display = edit(typst, 'Before $x^2$ after.\n', 'inline_math', makeDisplay);
		expect(display.source).toContain('$ x^2 $');
		const inline = edit(typst, '$ x^2 $ <eq:a>\n', 'block_math', makeInline);
		expect(inline.source).toBe('$x^2$\n');
	});
});

describe('a Markdown display', () => {
	/** the labels of the menu's formula items on the first `type` node of a Markdown source */
	function labels(source: string, type: string): string[] {
		const state = EditorState.create({ doc: parseMarkdownFile(source).doc });
		const view = { state, editable: true } as unknown as EditorView;
		const items = formulaItems({ view, pos: posOf(state.doc, type), syntax: 'latex', editable: true, openSettings: () => {} });
		return items.map((item) => ('label' in item ? `${item.label}${item.disabled ? ' [disabled]' : ''}` : '-'));
	}

	it('offers only what $$ keeps, and writes it as $$ and back', () => {
		// no number, label or environment: $$ holds the math alone
		expect(labels('$$\nx^2\n$$\n', 'block_math')).toEqual(['Convert to Inline Formula']);
		// an align read back from $$ has no environment attr, only its text
		expect(labels('$$\n\\begin{align}a &= b \\\\ c &= d\\end{align}\n$$\n', 'block_math')).toEqual([
			'Convert to Inline Formula [disabled]'
		]);
		const display = edit(markdown, 'Before $x^2$ after.\n', 'inline_math', makeDisplay);
		expect(display.source).toContain('$$\nx^2\n$$');
		const inline = edit(markdown, display.source, 'block_math', makeInline);
		expect(inline.source).toContain('$x^2$');
	});
});

describe('setting a LaTeX display', () => {
	it('carries its label onto the first line of an align and back', () => {
		const src =
			'\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\\begin{equation}\\label{eq:a}\na = b\n\\end{equation}\n\\end{document}\n';
		const align = edit(latex, src, 'block_math', (state, pos) => setDisplayKind(state, pos, 'align'));
		expect(align.source).toMatch(/\\begin\{align\}[\s\S]*\\label\{eq:a\}[\s\S]*\\end\{align\}/);
		const lines = edit(latex, align.source.replace('a = b', 'a &= b \\\\ c &= d'), 'block_math', (state, pos) =>
			setDisplayKind(state, pos, 'equation')
		);
		expect(lines.source).toMatch(/\\begin\{equation\}[\s\S]*\\label\{eq:a\}[\s\S]*\\begin\{aligned\}\s*a &= b \\\\ c &= d/);
	});

	it('keeps the label a multline is referenced by when its lines become an align or a gather', () => {
		const src =
			'\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\\begin{equation}\\label{eq:long}\na + b \\\\ + c\n\\end{equation}\nSee \\eqref{eq:long}.\n\\end{document}\n';
		for (const kind of ['align', 'gather'] as const) {
			// set as a multline first, as the menu does, and not read back from a file
			const lines = edit(latex, src, 'block_math', (state, pos) => {
				const multline = state.apply(setDisplayKind(state, pos, 'multline')!);
				return setDisplayKind(multline, pos, kind);
			});
			expect(lines.source).toMatch(new RegExp(`\\\\begin\\{${kind}\\}[\\s\\S]*\\\\label\\{eq:long\\}[\\s\\S]*\\\\end\\{${kind}\\}`));
		}
	});

	it('counts the lines of a cases inside an equation set as an align as one line, with one label', () => {
		const src =
			'\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\\begin{equation}\\label{eq:f}\nf(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & \\text{else} \\end{cases}\n\\end{equation}\n\\end{document}\n';
		const { source } = edit(latex, src, 'block_math', (state, pos) => setDisplayKind(state, pos, 'align'));
		const align = /\\begin\{align\}[\s\S]*?\\end\{align\}/.exec(source)![0];
		// amsmath stops on a second \label in one row
		expect(align.match(/\\label\{/g)).toHaveLength(1);
		expect(align).toMatch(/\\end\{cases\} \\label\{eq:f\}/);
	});

	it('gives a numbered display it sets as one equation a label to be referenced by', () => {
		const src =
			'\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n\\begin{align}\na &= b \\\\ c &= d\n\\end{align}\n\\end{document}\n';
		const { doc } = edit(latex, src, 'block_math', (state, pos) => setDisplayKind(state, pos, 'equation'));
		const display = doc.nodeAt(posOf(doc, 'block_math'))!;
		expect(display.attrs.numbered).toBe(true);
		expect(display.attrs.label).toBeTruthy();
	});
});
