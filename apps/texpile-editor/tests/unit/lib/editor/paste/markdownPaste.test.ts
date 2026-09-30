// @vitest-environment jsdom
// Markdown text pastes as formatting in each visual editor, and only Markdown does: LaTeX, Typst and
// plain prose keep their own paths.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EditorState, Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { sliceToLatex } from '$lib/editor/visual/extensions/latexClipboard';
import { sliceToTypst } from '$lib/languages/typst/visual/clipboard';
import { parseTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { typstEditorPlugins } from '$lib/languages/typst/visual/typstEditorSetup';
import { looksLikeMarkdown, markdownSlice } from '$lib/editor/paste/markdownPaste';

const ANSWER = '## Result\n\nThe **mean** is $\\mu = 3$, see [docs](https://x.com).\n\n- one\n- two\n';
const SWEEP = readFileSync(`${__dirname}/../../../../fixtures/comments/feature-sweep.typ`, 'utf8');

function textAt(doc: PMNode, words: string, offset: number): number {
	let at = -1;
	doc.descendants((node, pos) => {
		if (at < 0 && node.isText && node.text!.includes(words)) at = pos + node.text!.indexOf(words) + offset;
		return at < 0;
	});
	return at;
}

describe('markdown paste', () => {
	it('tells a Markdown answer from LaTeX, Typst and prose', () => {
		expect(looksLikeMarkdown(ANSWER, 'latex')).toBe(true);
		expect(looksLikeMarkdown(ANSWER, 'typst')).toBe(true);
		expect(looksLikeMarkdown('\\section{Intro} with **stars**', 'latex')).toBe(false);
		expect(looksLikeMarkdown('= Intro\n- one\n- two', 'typst')).toBe(false);
		expect(looksLikeMarkdown('A footnote* in prose, and a 5 * 3 product.', 'latex')).toBe(false);
	});

	it('leaves code and TeX quotes as text', () => {
		const texts = [
			'Override __init__ and __repr__',
			'print(2**10, 3**2)',
			"He said ``hello'' and ``goodbye''.",
			'# compute the mean\nx = sum(v) / len(v)',
			'>>> x = 1\n>>> y = 2',
			'handlers[name](event)'
		];
		for (const text of texts) expect(looksLikeMarkdown(text, 'latex'), text).toBe(false);
		expect(looksLikeMarkdown('See [the guide](docs/guide.md) and __this part__.', 'latex')).toBe(true);
	});

	it('keeps the text after the caret out of a pasted table', () => {
		const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Before after')])]);
		const state = EditorState.create({ doc, selection: TextSelection.create(doc, 8) });
		const pasted = state.tr.replaceSelection(markdownSlice('Here:\n\n| a | b |\n|---|---|\n| 1 | 2 |', schema)!).doc;
		expect(pasted.lastChild!.type.name).toBe('paragraph');
		expect(pasted.lastChild!.textContent).toBe('after');
	});

	// the Typst editor's guards for a selection ProseMirror cannot join see the paste first
	it('pastes Markdown over a list item and a term title in the Typst editor', () => {
		const doc = parseTypstFile(SWEEP).doc;
		const plugins = typstEditorPlugins({
			mathlivePlugin: new Plugin({}),
			mlarrowHandlers: new Plugin({}),
			docDir: () => '',
			placeholder: '',
			addCommentLabel: ''
		});
		// the other plugin views measure layout jsdom has none of
		const state = EditorState.create({ doc, plugins: plugins.filter((plugin) => plugin.props.handlePaste || !plugin.spec.view) });
		const view = new EditorView(document.createElement('div'), { state });
		view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, textAt(doc, 'numbering is', 3), textAt(doc, 'Term', 2))));
		const text = 'Some **bold** words';
		const clipboardData = { getData: (type: string) => (type === 'text/plain' ? text : '') };
		expect(view.pasteText(text, Object.assign(new Event('paste'), { clipboardData }) as unknown as ClipboardEvent)).toBe(true);
		expect(view.state.doc.textContent).toContain('The numSome **bold** words');
		view.destroy();
	});

	it('writes the answer’s formatting and math in the editor’s language', () => {
		expect(sliceToLatex(markdownSlice(ANSWER, schema)!)).toBe(
			'\\subsection{Result}\nThe \\textbf{mean} is $\\mu = 3$, see \\href{https://x.com}{docs}.\n\n\\begin{itemize}\n\\item one\n\\item two\n\\end{itemize}'
		);
		expect(sliceToTypst(markdownSlice(ANSWER, typSchema)!)).toBe(
			'== Result\n\nThe *mean* is $mu = 3$, see #link("https://x.com")[docs].\n\n- one\n- two'
		);
	});
});
