// the word the caret is typing in. The line breaker leaves it whole, because the split points of half a word move
// with every letter; it is released once the caret leaves it
import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';

export type TypedWord = { from: number; to: number };

export const wordBeingTypedKey = new PluginKey<TypedWord | null>('texpile-word-being-typed');

// someone else's edit, or an attribute set elsewhere, is not typing here
function changeTouches(tr: Transaction, pos: number): boolean {
	let touches = false;
	tr.mapping.maps.forEach((map, index) => {
		const rest = tr.mapping.slice(index + 1);
		map.forEach((_oldFrom, _oldTo, from, to) => {
			if (rest.map(from, -1) <= pos && pos <= rest.map(to, 1)) touches = true;
		});
	});
	return touches;
}

// cut the way paragraphItems cuts words: a run without a space inside one text node
function wordEndingAtCaret(state: EditorState): TypedWord | null {
	const { $head, empty } = state.selection;
	if (!empty || !$head.parent.isTextblock) return null;
	const { node, offset } = $head.parent.childBefore($head.parentOffset);
	if (!node?.isText) return null;
	const text = node.text!;
	const caret = $head.parentOffset - offset;
	if (text[caret - 1] === ' ') return null;
	let from = caret;
	while (from > 0 && text[from - 1] !== ' ') from--;
	let to = caret;
	while (to < text.length && text[to] !== ' ') to++;
	const start = $head.start() + offset;
	return { from: start + from, to: start + to };
}

export function wordBeingTypedPlugin(): Plugin<TypedWord | null> {
	return new Plugin<TypedWord | null>({
		key: wordBeingTypedKey,
		state: {
			init: () => null,
			apply(tr, word, _before, state) {
				if (tr.docChanged && changeTouches(tr, state.selection.head)) return wordEndingAtCaret(state);
				if (!word) return null;
				const from = tr.mapping.map(word.from, 1);
				const to = tr.mapping.map(word.to, -1);
				const { empty, head } = state.selection;
				if (from >= to || !empty || head < from || head > to) return null;
				return from === word.from && to === word.to ? word : { from, to };
			}
		}
	});
}
