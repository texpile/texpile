// A15: a word being typed shows no proofread mark until the caret leaves it; the marks stay in the proofreader's set
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { ReplaceStep } from 'prosemirror-transform';
import type { Decoration } from 'prosemirror-view';

export type TypedWord = { readonly from: number; readonly to: number };

export const typedWordKey = new PluginKey<TypedWord | null>('typedWord');

const WORD_CHAR = /[\p{L}\p{N}'’]/u;

/** the word the caret at pos stands in or at the end of; null beside a space or punctuation */
export function wordAround(doc: PMNode, pos: number): TypedWord | null {
	const $pos = doc.resolve(pos);
	if (!$pos.parent.isTextblock) return null;
	const start = $pos.start();
	const text = $pos.parent.textBetween(0, $pos.parent.content.size, undefined, '￼');
	let from = pos - start;
	let to = from;
	while (from > 0 && WORD_CHAR.test(text[from - 1])) from--;
	while (to < text.length && WORD_CHAR.test(text[to])) to++;
	return from < to && from < pos - start ? { from: start + from, to: start + to } : null;
}

/** typed letters or a deletion by key: text in, or nothing in, with no paste */
function typed(tr: Transaction): boolean {
	if (!tr.selection.empty || tr.getMeta('paste') || tr.getMeta('uiEvent') === 'paste' || tr.getMeta('uiEvent') === 'drop') return false;
	return tr.steps.every(
		(step) =>
			step instanceof ReplaceStep &&
			step.slice.content.childCount <= 1 &&
			(step.slice.size === 0 || !!step.slice.content.firstChild?.isText)
	);
}

/** the proofread marks over the typed word, which are held back from drawing */
export function heldProofreadRanges(marks: readonly Decoration[], word: TypedWord | null): Decoration[] {
	if (!word) return [];
	return marks.filter((mark) => mark.from <= word.to && mark.to >= word.from);
}

export const typedWordPlugin = new Plugin<TypedWord | null>({
	key: typedWordKey,
	state: {
		init: () => null,
		apply(tr, word, _before, state) {
			if (tr.docChanged) {
				if (typed(tr)) return wordAround(state.doc, state.selection.head);
				return word && { from: tr.mapping.map(word.from, -1), to: tr.mapping.map(word.to, 1) };
			}
			// a move, a click or a selection: the word is left, and its marks show
			return tr.selectionSet ? null : word;
		}
	}
});
