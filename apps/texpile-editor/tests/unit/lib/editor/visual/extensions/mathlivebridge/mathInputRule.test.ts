import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection, type Plugin } from 'prosemirror-state';
import { inputRules, undoInputRule } from 'prosemirror-inputrules';
import type { Schema } from 'prosemirror-model';
import { schema as texSchema } from '$lib/languages/latex/schema/latexPMSchema';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { mathInputRules } from '$lib/editor/visual/extensions/mathlivebridge/mathInputRule';
import type { MathSyntax } from '$lib/editor/visual/extensions/mathlivebridge/mathFieldFactory';

type Typing = { state: EditorState; dispatch(tr: Parameters<EditorState['apply']>[0]): void; composing: false };

function editor(schema: Schema, syntax: MathSyntax, text = '') {
	const plugin = inputRules({ rules: mathInputRules(syntax) });
	const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, text ? schema.text(text) : null));
	const view: Typing = {
		state: EditorState.create({ doc, selection: TextSelection.create(doc, 1 + text.length), plugins: [plugin] }),
		dispatch(tr) {
			view.state = view.state.apply(tr);
		},
		composing: false
	};
	const handle = (plugin as Plugin).props.handleTextInput!;
	function type(chars: string) {
		for (const char of chars) {
			const { from, to } = view.state.selection;
			if (!handle.call(plugin, view as never, from, to, char, () => view.state.tr)) view.dispatch(view.state.tr.insertText(char, from, to));
		}
	}
	return { view, type };
}

describe('typing $x$ in text', () => {
	it('makes an inline formula of $x^2$ with the caret after it, and Backspace gives the typed text back', () => {
		const { view, type } = editor(texSchema, 'latex', 'a ');
		type('$x^2$');
		const paragraph = view.state.doc.firstChild!;
		expect(paragraph.child(1).type.name).toBe('inline_math');
		expect(paragraph.child(1).textContent).toBe('x^2');
		expect(view.state.selection.from).toBe(1 + 2 + paragraph.child(1).nodeSize);
		undoInputRule(view.state, view.dispatch);
		expect(view.state.doc.firstChild!.textContent).toBe('a $x^2$');
	});

	it('leaves prices and an escaped dollar as text', () => {
		const { view, type } = editor(texSchema, 'latex');
		type('$5 and $10 and \\$x$');
		expect(view.state.doc.firstChild!.childCount).toBe(1);
		expect(view.state.doc.textContent).toBe('$5 and $10 and \\$x$');
	});

	it('makes a display of Typst $ x $', () => {
		const { view, type } = editor(typSchema, 'typst');
		type('$ x $');
		expect(view.state.doc.firstChild!.type.name).toBe('block_math');
		expect(view.state.doc.firstChild!.textContent).toBe('x');
		expect(view.state.selection).toBeInstanceOf(TextSelection);
		type('N');
		expect(view.state.doc.firstChild!.textContent).toBe('x');
		expect(view.state.doc.lastChild!.textContent).toBe('N');
	});

	it('puts the caret after a Typst display made mid-paragraph, not in the next display', () => {
		const { view, type } = editor(typSchema, 'typst', 'a ');
		const next = typSchema.nodes.block_math.create(null, typSchema.text('q'));
		view.state = EditorState.create({
			doc: view.state.doc.copy(view.state.doc.content.append(typSchema.nodes.doc.create(null, next).content)),
			selection: TextSelection.create(view.state.doc, 3),
			plugins: view.state.plugins
		});
		type('$ c $');
		type(' y');
		expect(view.state.doc.lastChild!.textContent).toBe('q');
		expect(view.state.doc.textContent).toContain(' y');
		expect(view.state.doc.child(1).textContent).toBe('c');
	});

	it('gives the typed Typst text back on Backspace right after the display', () => {
		const { view, type } = editor(typSchema, 'typst');
		type('$ x $');
		expect(undoInputRule(view.state, view.dispatch)).toBe(true);
		expect(view.state.doc.textContent).toBe('$ x $');
	});

	it('leaves $x$ typed inside inline code as text', () => {
		const { view, type } = editor(texSchema, 'latex');
		view.dispatch(view.state.tr.setStoredMarks([texSchema.marks.code.create()]));
		type('$x$');
		expect(view.state.doc.firstChild!.childCount).toBe(1);
		expect(view.state.doc.textContent).toBe('$x$');
	});
});
