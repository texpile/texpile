// @vitest-environment jsdom
// A raw block copied from one of Texpile's visual editors stays raw source only in a file of its own
// language: Typst's `#lorem(20)` pasted into LaTeX is a code block, never LaTeX source with a bare #.
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { Node as PMNode, Schema } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { sliceToLatex } from '$lib/editor/visual/extensions/latexClipboard';
import { visualSmartPaste } from '$lib/editor/paste/visualSmartPaste';
import { texpileClipboardSerializer } from '$lib/editor/paste/texpileCopy';

// jsdom has no ClipboardEvent, which ProseMirror's paste makes for its handlers
globalThis.ClipboardEvent ??= class extends Event {
	clipboardData = null;
} as unknown as typeof ClipboardEvent;

function copied(from: Schema, raw: string): string {
	const doc = from.node('doc', null, [
		from.node('paragraph', null, [from.text('Intro')]),
		from.nodes.raw_latex.create(null, from.text(raw))
	]);
	const wrap = document.createElement('div');
	wrap.append(texpileClipboardSerializer(from).serializeFragment(doc.content, { document }));
	return wrap.innerHTML;
}

function pastedIntoLatex(html: string): PMNode {
	const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('x')])]);
	const state = EditorState.create({ doc, plugins: [visualSmartPaste('latex', schema, () => false)], selection: TextSelection.atEnd(doc) });
	const view = new EditorView(document.createElement('div'), { state });
	const clipboardData = { getData: (type: string) => (type === 'text/html' ? html : '') };
	view.pasteHTML(html, Object.assign(new Event('paste'), { clipboardData }) as unknown as ClipboardEvent);
	const out = view.state.doc;
	view.destroy();
	return out;
}

describe('pasted raw blocks', () => {
	it('puts a Typst raw block pasted into LaTeX in as code', () => {
		const out = sliceToLatex(pastedIntoLatex(copied(typSchema, '#lorem(20)')).slice(0));
		expect(out).toContain('\\begin{verbatim}\n#lorem(20)\n\\end{verbatim}');
	});

	it('keeps a raw block pasted into a file of its own language raw', () => {
		const blocks: string[] = [];
		pastedIntoLatex(copied(schema, '\\maketitle')).forEach((node) => blocks.push(`${node.type.name}:${node.textContent}`));
		expect(blocks).toContain('raw_latex:\\maketitle');
	});
});
