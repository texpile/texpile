// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Plugin } from 'prosemirror-state';
import type { CanvasView } from '$lib/editor/canvas';
import { visualSmartPaste } from '$lib/editor/paste/visualSmartPaste';
import { latexClipboardPlugin, pasteLatexText } from '$lib/editor/visual/extensions/latexClipboard';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { markdownCopyPlugin } from '$lib/languages/markdown/visual/clipboard';
import { markdownToProseMirror } from '$lib/languages/markdown/visual/converter';
import { mdSchema } from '$lib/languages/markdown/visual/schema';
import { typstCopyPlugin } from '$lib/languages/typst/visual/clipboard';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { pasteMarkdownSource } from '$lib/editor/paste/visualSmartPaste';
import { createTestCanvasView, settleTestView } from '../../testing/testCanvasView';

// jsdom has no ClipboardEvent, which view.pasteText makes as prosemirror-view does
globalThis.ClipboardEvent ??= class extends Event {
	clipboardData = null;
} as unknown as typeof ClipboardEvent;

class TestClipboardData {
	private readonly data = new Map<string, string>();
	getData(type: string): string {
		return this.data.get(type) ?? '';
	}
	setData(type: string, value: string): void {
		this.data.set(type, value);
	}
	clearData(): void {
		this.data.clear();
	}
}

function clipboardEvent(type: 'copy' | 'paste', data: TestClipboardData): ClipboardEvent {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, 'clipboardData', { value: data });
	return event as ClipboardEvent;
}

const LATEX = 'A reference \\ref{intro}, a note\\footnote{The note.} and the formula $x^2+y^2$ sit in this sentence.';
const TYPST = 'A reference @intro, a note#footnote[The note.] and the formula $x^2 + y^2$ sit in this sentence.';
const MARKDOWN = 'A raw chip <kbd>Ctrl</kbd> and the formula $x^2+y^2$ sit in this sentence.';

/** the paragraph to copy, then an empty one to paste into */
async function editorOn(doc: PMNode, plugins: Plugin[]): Promise<{ view: CanvasView; copied: PMNode }> {
	const copied = doc.firstChild!;
	const withEmpty = doc.type.create(doc.attrs, [copied, copied.type.create()]);
	const selection = TextSelection.create(withEmpty, 1, 1 + copied.content.size);
	const view = createTestCanvasView(EditorState.create({ doc: withEmpty, selection, plugins }));
	await settleTestView(view);
	return { view, copied };
}

function copySelection(view: CanvasView): TestClipboardData {
	const data = new TestClipboardData();
	const event = clipboardEvent('copy', data);
	view.dispatchEvent(event);
	expect(event.defaultPrevented).toBe(true);
	return data;
}

/** pasted into the last paragraph, which is empty */
function pasteAtEnd(view: CanvasView, data: TestClipboardData): PMNode {
	const { doc } = view.state;
	view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(doc)));
	const event = clipboardEvent('paste', data);
	view.dispatchEvent(event);
	expect(event.defaultPrevented).toBe(true);
	return view.state.doc.lastChild!;
}

function textOnly(text: string): TestClipboardData {
	const data = new TestClipboardData();
	data.setData('text/plain', text);
	return data;
}

describe('copy and paste of a paragraph holding a chip and a formula', () => {
	it('LaTeX: the copy is LaTeX, and its paste and a paste of the LaTeX alone put the paragraph back', async () => {
		const { view, copied } = await editorOn(treeToProseMirror(LATEX).doc, [
			visualSmartPaste('latex', schema, pasteLatexText),
			latexClipboardPlugin
		]);
		expect(copied.content.child(1).type.name).toBe('ref');
		const data = copySelection(view);
		expect(data.getData('text/plain')).toBe(LATEX);
		expect(data.getData('text/html')).toContain('data-pm-slice');
		expect(pasteAtEnd(view, data).content.eq(copied.content)).toBe(true);
		view.dispatch(view.state.tr.insert(view.state.doc.content.size, schema.nodes.paragraph.create()));
		expect(pasteAtEnd(view, textOnly(LATEX)).content.eq(copied.content)).toBe(true);
		view.destroy();
	});

	it('Typst: the copy is Typst, and its paste puts the paragraph back', async () => {
		const { view, copied } = await editorOn(typstToProseMirror(TYPST).doc, [
			typstCopyPlugin,
			visualSmartPaste('typst', typSchema, () => false)
		]);
		expect(copied.content.child(1).type.name).toBe('typ_ref');
		const data = copySelection(view);
		expect(data.getData('text/plain')).toBe(TYPST);
		expect(pasteAtEnd(view, data).content.eq(copied.content)).toBe(true);
		view.destroy();
	});

	it('Markdown: the copy is Markdown, and its paste and a paste of the Markdown alone put the paragraph back', async () => {
		const { view, copied } = await editorOn(markdownToProseMirror(MARKDOWN).doc, [
			markdownCopyPlugin,
			visualSmartPaste('markdown', mdSchema, pasteMarkdownSource)
		]);
		const data = copySelection(view);
		expect(data.getData('text/plain')).toBe(MARKDOWN);
		expect(pasteAtEnd(view, data).content.eq(copied.content)).toBe(true);
		view.dispatch(view.state.tr.insert(view.state.doc.content.size, mdSchema.nodes.paragraph.create()));
		expect(pasteAtEnd(view, textOnly(MARKDOWN)).content.eq(copied.content)).toBe(true);
		view.destroy();
	});
});
