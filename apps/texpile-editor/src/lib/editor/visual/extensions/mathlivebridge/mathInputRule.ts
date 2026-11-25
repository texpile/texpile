// typing $x$ in text makes a formula (A10): the closing $ turns the run into an inline formula, the caret after it
import { InputRule } from 'prosemirror-inputrules';
import { NodeSelection, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { MathSyntax } from './mathFieldFactory';
import { makeDisplay } from './mathMenu/mathFormulaType';

// an unescaped $, then a run starting and ending with neither a space, a $ nor (at the end) a backslash
const INLINE = /(?<!\\)\$([^\s$](?:[^$]*[^\s$\\])?)\$$/;
// Typst's display: $ x $, spaces inside both ends
const TYPST_DISPLAY = /(?<!\\)\$(\s+[^\s$](?:[^$]*[^\s$\\])?\s+)\$$/;
const EMPTY_DISPLAY = /^\$\$$/;
const OBJECT = '￼';

function inlineFormula(state: EditorState, source: string, start: number, end: number): Transaction | null {
	const $start = state.doc.resolve(start);
	const { inline_math: type } = state.schema.nodes;
	if (!type || source.includes(OBJECT) || !$start.parent.canReplaceWith($start.index(), $start.index(), type)) return null;
	const marks = state.doc.nodeAt(start)?.marks ?? $start.marks();
	const tr = state.tr.replaceWith(start, end, type.create(null, state.schema.text(source), marks));
	return tr.setSelection(TextSelection.create(tr.doc, start + source.length + 2));
}

function typstDisplay(state: EditorState, source: string, start: number, end: number): Transaction | null {
	const tr = inlineFormula(state, source, start, end);
	if (!tr) return null;
	const display = makeDisplay(state.apply(tr), start);
	if (!display) return null;
	display.steps.forEach((step) => tr.step(step));
	const shown = display.selection instanceof NodeSelection ? display.selection : null;
	if (!shown) return tr;
	const after = shown.to;
	const { paragraph } = state.schema.nodes;
	if (!shown.node.attrs.continuesAfter) {
		const $after = tr.doc.resolve(after);
		if (!paragraph || !$after.parent.canReplaceWith($after.index(), $after.index(), paragraph))
			return tr.setSelection(shown.map(tr.doc, tr.mapping));
		tr.insert(after, paragraph.create());
	}
	return tr.setSelection(TextSelection.create(tr.doc, after + 1));
}

/** $$ in an empty paragraph: an empty display, entered */
function emptyDisplay(state: EditorState, start: number, end: number): Transaction | null {
	const $start = state.doc.resolve(start);
	const paragraph = $start.parent;
	const { block_math: type } = state.schema.nodes;
	if (!type || paragraph.type.name !== 'paragraph' || paragraph.content.size !== end - start) return null;
	const before = $start.before();
	const tr = state.tr.replaceWith(before, $start.after(), type.create(null, state.schema.text(' ')));
	return tr.setSelection(NodeSelection.create(tr.doc, before));
}

export function mathInputRules(syntax: MathSyntax): InputRule[] {
	const inline = new InputRule(INLINE, (state, match, start, end) => inlineFormula(state, match[1], start, end), { inCodeMark: false });
	if (syntax === 'typst') {
		return [
			new InputRule(TYPST_DISPLAY, (state, match, start, end) => typstDisplay(state, match[1].trim(), start, end), { inCodeMark: false }),
			inline
		];
	}
	return [new InputRule(EMPTY_DISPLAY, (state, _match, start, end) => emptyDisplay(state, start, end), { inCodeMark: false }), inline];
}
