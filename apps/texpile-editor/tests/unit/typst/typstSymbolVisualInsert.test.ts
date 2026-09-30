// @vitest-environment jsdom
// The symbol picker in the Typst visual editor: a symbol goes in as its character, one with no ink
// as the `#sym.` chip the converter reads that name back as, and a selected node is never replaced.
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { insertTypstSymbolVisual } from '$lib/languages/typst/symbols/typstSymbolVisualInsert';
import { typstSymbolByName } from '$lib/languages/typst/symbols/typstSymbols';

/** just enough of an EditorView: dispatch applies, focus does nothing */
function fakeView(state: EditorState): EditorView & { state: EditorState } {
	const view = {
		state,
		dispatch(tr: Transaction) {
			view.state = view.state.apply(tr);
		},
		focus() {}
	};
	return view as unknown as EditorView & { state: EditorState };
}

/** the position just after the first occurrence of `text` */
function after(doc: PMNode, text: string): number {
	let found = -1;
	doc.descendants((node, pos) => {
		if (found < 0 && node.isText && node.text!.includes(text)) found = pos + node.text!.indexOf(text) + text.length;
	});
	if (found < 0) throw new Error(`no ${text}`);
	return found;
}

function insertAt(source: string, anchorText: string, name: string): { typst: string; doc: PMNode } {
	const { doc } = typstToProseMirror(source);
	const state = EditorState.create({ doc, selection: TextSelection.create(doc, after(doc, anchorText)) });
	const view = fakeView(state);
	insertTypstSymbolVisual(view, typstSymbolByName(name)!);
	return { typst: serializeToTypst(view.state.doc), doc: view.state.doc };
}

describe('in text', () => {
	it('types the character', () => {
		expect(insertAt('Hello world\n', 'Hello', 'sym.arrow.r.double').typst).toBe('Hello⇒ world');
	});

	it('leaves the shorthand to the serializer', () => {
		expect(insertAt('pages 1 9\n', 'pages 1', 'sym.dash.en').typst).toBe('pages 1-- 9');
	});

	it('puts a character with no ink in as its code chip', () => {
		const { typst, doc } = insertAt('a b\n', 'a', 'sym.space.thin');
		expect(typst).toBe('a#sym.space.thin b');
		expect(doc.firstChild!.child(1).type.name).toBe('inline_latex');
	});

	it('reads that chip back from the source it writes', () => {
		const { doc } = typstToProseMirror('a#sym.space.thin b\n');
		const chip = doc.firstChild!.child(1);
		expect(chip.type.name).toBe('inline_latex');
		expect(chip.textContent).toBe('#sym.space.thin');
	});

	it('types the no-break space, which the converter reads `~` as', () => {
		const { typst, doc } = insertAt('Mr. Smith\n', 'Mr.', 'sym.space.nobreak');
		expect(doc.textContent).toBe('Mr.  Smith');
		expect(typstToProseMirror(typst).doc.textContent).toBe('Mr.  Smith');
	});
});

it('types a character with no ink as itself in a code block, where no chip can stand', () => {
	const { doc } = insertAt('```\nab\n```\n', 'a', 'sym.space.thin');
	expect(doc.textContent).toContain('a b');
});

it('puts the symbol after a selected formula rather than over it', () => {
	const { doc } = typstToProseMirror('See $x$ here\n');
	let mathPos = -1;
	doc.descendants((node, pos) => {
		if (node.type.name === 'inline_math') mathPos = pos;
	});
	const view = fakeView(EditorState.create({ doc, selection: NodeSelection.create(doc, mathPos) }));
	insertTypstSymbolVisual(view, typstSymbolByName('sym.arrow.r')!);
	expect(serializeToTypst(view.state.doc)).toBe('See $x$→ here');
});
