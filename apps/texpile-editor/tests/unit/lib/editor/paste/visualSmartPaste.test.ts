// @vitest-environment jsdom
// What decides a visual paste: a code editor's copy of the file's own language is read as that
// language, a copy is Texpile's only by Texpile's own mark, and a paste that leaves pictures out
// says so only when it is the one that goes in.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { mdSchema } from '$lib/languages/markdown/visual/schema';
import { pasteMarkdownSource, visualSmartPaste } from '$lib/editor/paste/visualSmartPaste';
import { isTexpileCopy } from '$lib/editor/paste/texpileCopy';
import { toaster } from '$lib/modals/toaster-svelte';
import { settings } from '$lib/settings';

// jsdom has no ClipboardEvent, which ProseMirror's paste makes for its handlers
globalThis.ClipboardEvent ??= class extends Event {
	clipboardData = null;
} as unknown as typeof ClipboardEvent;

function markdownEditor(text = 'x'): EditorView {
	const doc = mdSchema.node('doc', null, [mdSchema.node('paragraph', null, [mdSchema.text(text)])]);
	const state = EditorState.create({
		doc,
		plugins: [visualSmartPaste('markdown', mdSchema, pasteMarkdownSource)],
		selection: TextSelection.atEnd(doc)
	});
	return new EditorView(document.createElement('div'), { state });
}

function paste(view: EditorView, html: string, text: string): void {
	const clipboardData = { getData: (type: string) => (type === 'text/html' ? html : type === 'text/plain' ? text : '') };
	view.pasteHTML(html, Object.assign(new Event('paste'), { clipboardData }) as unknown as ClipboardEvent);
}

function blockTypes(view: EditorView): string[] {
	const out: string[] = [];
	view.state.doc.forEach((node) => out.push(node.type.name));
	return out;
}

/** how VS Code puts a selection on the clipboard: every line a div, in the editor font, pre white-space */
function vscodeCopy(lines: string[]): string {
	const style = "color: #cccccc;font-family: Consolas, 'Courier New', monospace;white-space: pre;";
	return `<meta charset='utf-8'><div style="${style}">${lines.map((line) => (line ? `<div><span>${line}</span></div>` : '<br>')).join('')}</div>`;
}

afterEach(() => {
	settings.current = { ...settings.current, smartPaste: true };
	vi.restoreAllMocks();
});

describe('visual smart paste', () => {
	it('reads a code editor’s copy of the file’s own language as that language, and other code as a code block', () => {
		const markdown = markdownEditor();
		paste(markdown, vscodeCopy(['The **mean** is 3.']), 'The **mean** is 3.');
		let bold = '';
		markdown.state.doc.descendants((node) => void (node.marks.some((mark) => mark.type.name === 'strong') && (bold += node.text)));
		expect(bold).toBe('mean');

		// a comment line over code is no heading: the copy goes in as the code it is
		const code = markdownEditor();
		paste(code, vscodeCopy(['# Setup', 'x = 1']), '# Setup\nx = 1');
		expect(blockTypes(code)).not.toContain('heading');
		expect(code.state.doc.textContent).toContain('# Setup');
	});

	it('knows its own copies by its own mark, not by the slice marker every ProseMirror app writes', () => {
		const view = markdownEditor('Some words');
		const { dom } = view.serializeForClipboard(view.state.doc.slice(0, view.state.doc.content.size));
		expect(isTexpileCopy(dom.innerHTML)).toBe(true);
		expect(isTexpileCopy('<p data-pm-slice="1 1 []">From another editor</p>')).toBe(false);
	});

	it('says pictures were left out only when the paste that left them out goes in', () => {
		const warning = vi.spyOn(toaster, 'warning');
		const html = '<p>A picture</p><img src="file:///C:/Temp/word/image1.png">';
		settings.current = { ...settings.current, smartPaste: false };
		paste(markdownEditor(), html, 'A picture');
		expect(warning).not.toHaveBeenCalled();
		settings.current = { ...settings.current, smartPaste: true };
		paste(markdownEditor(), html, 'A picture');
		expect(warning).toHaveBeenCalledTimes(1);
	});
});

describe('a table pasted into LaTeX', () => {
	it('comes in without header cells, so the saved file reopens as shown', async () => {
		const { schema } = await import('$lib/languages/latex/schema/latexPMSchema');
		const { serializeToLatex } = await import('$lib/languages/latex/serializer/latexSerializer');
		const { treeToProseMirror } = await import('$lib/languages/latex/parser/tree/importTree');
		const { reopenDifference } = await import('$lib/editor/visual/docShape');
		const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('x')])]);
		const view = new EditorView(document.createElement('div'), {
			state: EditorState.create({ doc, plugins: [visualSmartPaste('latex', schema, () => false)], selection: TextSelection.atEnd(doc) })
		});
		paste(view, '<table><tr><th>Method</th><th>Examples</th></tr><tr><td>Probes</td><td>linear</td></tr></table>', 'Method\tExamples');
		const types = new Set<string>();
		view.state.doc.descendants((node) => void types.add(node.type.name));
		expect(types.has('table_cell')).toBe(true);
		expect(types.has('table_header')).toBe(false);
		const reopened = treeToProseMirror(serializeToLatex(view.state.doc), {}).doc;
		expect(reopenDifference(view.state.doc, reopened, 'tex')).toBeNull();
	});
});

describe('dollar math pasted into LaTeX', () => {
	it('becomes math, while prices, code and escaped dollars stay text', async () => {
		const { schema } = await import('$lib/languages/latex/schema/latexPMSchema');
		const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('x')])]);
		const view = new EditorView(document.createElement('div'), {
			state: EditorState.create({ doc, plugins: [visualSmartPaste('latex', schema, () => false)], selection: TextSelection.atEnd(doc) })
		});
		paste(
			view,
			'<table><tr><td>Formula</td><td>$\\theta^\\top h + b$</td></tr></table><p>It costs $5 and $10, \\(x\\) here, <code>$y$</code>, \\$z\\$.</p>',
			''
		);
		const math: string[] = [];
		view.state.doc.descendants((node) => void (node.type.name === 'inline_math' && math.push(node.textContent)));
		expect(math).toEqual(['\\theta^\\top h + b', 'x']);
		expect(view.state.doc.textContent).toContain('It costs $5 and $10');
	});
});

describe('a copy of one block pasted into another', () => {
	const latexDoc = (body: string) =>
		`\\documentclass{article}\n\\usepackage{amsthm}\n\\newtheorem{theorem}{Theorem}\n\\begin{document}\n\n${body}\n\n\\end{document}\n`;
	const figure = '\\begin{figure}[h]\n\\centering\n\\includegraphics[width=3cm]{plot.png}\n\\caption{Caption words}\n\\end{figure}';

	async function openLatex(body: string): Promise<EditorView> {
		const { schema } = await import('$lib/languages/latex/schema/latexPMSchema');
		const { parseLatexFile } = await import('$lib/workspace/latexRoundtrip');
		const { doc } = parseLatexFile(latexDoc(body));
		return new EditorView(document.createElement('div'), {
			state: EditorState.create({ doc, plugins: [visualSmartPaste('latex', schema, () => false)] })
		});
	}

	function copyAndPasteAt(view: EditorView, copied: (name: string) => boolean, caretAfter: string): void {
		let from = -1;
		let to = -1;
		view.state.doc.descendants((n, pos) => {
			if (from < 0 && copied(n.type.name)) [from, to] = [pos, pos + n.nodeSize];
			return from < 0;
		});
		const html = view.serializeForClipboard(view.state.doc.slice(from, to)).dom.innerHTML;
		let at = -1;
		view.state.doc.descendants((n, pos) => {
			if (at < 0 && n.isText && n.text!.includes(caretAfter)) at = pos + n.text!.indexOf(caretAfter) + caretAfter.length;
		});
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
		paste(view, html, '');
	}

	it('keeps inline math pasted in a figure caption as math', async () => {
		const inCaption = await openLatex(`Math $x^2$ here.\n\n${figure}`);
		copyAndPasteAt(inCaption, (name) => name === 'inline_math', 'Caption words');
		const { serializeToLatex } = await import('$lib/languages/latex/serializer/latexSerializer');
		expect(serializeToLatex(inCaption.state.doc)).toContain('\\caption{Caption words$x^2$}');
	});
});
