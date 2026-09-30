import type { Transaction } from 'prosemirror-state';
import { collapseNodeSelection } from '$lib/editor/symbols/symbolVisualCaret';
import type { EditorView } from 'prosemirror-view';
import type { TypstSymbol, TypstSymbolInsertion } from './typstSymbol.types';

/**
 * The visual editor holds characters, not markup, and writes the shorthands (`--`, `~`) itself, so a
 * symbol goes in as its character. One with no ink goes in as the `#sym.` code chip the editor reads
 * that name back as, where a chip may stand: not in a code block, and not in code-formatted text.
 */
export function typstSymbolVisualInsertion(tr: Transaction, symbol: TypstSymbol): TypstSymbolInsertion {
	if (!symbol.invisible || symbol.markupShorthand) return { kind: 'text', text: symbol.value };
	const chipType = tr.doc.type.schema.nodes.inline_latex;
	const { $from } = tr.selection;
	const marks = tr.storedMarks ?? $from.marks();
	const canHoldChip = chipType !== undefined && $from.parent.canReplaceWith($from.index(), $from.index(), chipType);
	const inCode = marks.some((mark) => mark.type.name === 'code');
	return canHoldChip && !inCode ? { kind: 'code', text: `#${symbol.name}` } : { kind: 'text', text: symbol.value };
}

export function insertTypstSymbolVisual(view: EditorView, symbol: TypstSymbol): void {
	const tr = collapseNodeSelection(view.state);
	const insertion = typstSymbolVisualInsertion(tr, symbol);
	const { schema } = view.state;
	if (insertion.kind === 'code')
		tr.replaceSelectionWith(schema.nodes.inline_latex.create({ lang: 'typst' }, schema.text(insertion.text)), true);
	else tr.insertText(insertion.text);
	view.dispatch(tr.scrollIntoView());
	view.focus();
}
