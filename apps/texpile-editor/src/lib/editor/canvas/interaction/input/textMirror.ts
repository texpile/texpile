// the caret's textblock as the string an input method reads (11.1): text one to one, inline nodes as U+FFFC, hard breaks as \n
import type { EditorState } from 'prosemirror-state';
import type { TextMirror } from '../../contracts/inputTypes';

export const MIRROR_WINDOW = 4000;
const OBJECT = '￼';

/** nothing for the input method to read: a formula session takes text as typed */
export function emptyMirror(at: number): TextMirror {
	return { text: '', start: at, selection: { start: 0, end: 0 }, toDoc: () => at, fromDoc: () => 0 };
}

/** pieces of the textblock: each char's document position, and where the textblock's content ends */
function piecesOf(state: EditorState, start: number): { text: string; positions: number[]; end: number } {
	const parent = state.selection.$head.parent;
	let text = '';
	const positions: number[] = [];
	parent.forEach((child, offset) => {
		const at = start + offset;
		if (child.isText) {
			const value = child.text!;
			text += value;
			for (let i = 0; i < value.length; i++) positions.push(at + i);
		} else {
			text += child.type.name === 'hard_break' ? '\n' : OBJECT;
			positions.push(at);
		}
	});
	return { text, positions, end: start + parent.content.size };
}

/** the offset of the first character at or after `pos` */
function offsetOf(positions: readonly number[], pos: number): number {
	let low = 0;
	let high = positions.length;
	while (low < high) {
		const mid = (low + high) >> 1;
		if (positions[mid] < pos) low = mid + 1;
		else high = mid;
	}
	return low;
}

export function textMirrorOf(state: EditorState, size = MIRROR_WINDOW): TextMirror {
	const { $head, $anchor } = state.selection;
	if (!$head.parent.inlineContent) return emptyMirror(state.selection.from);
	const pieces = piecesOf(state, $head.start());
	const head = offsetOf(pieces.positions, $head.pos);
	const first = Math.max(0, Math.min(head - (size >> 1), pieces.text.length - size));
	const last = Math.min(pieces.text.length, first + size);
	const positions = pieces.positions.slice(first, last);
	const windowEnd = last < pieces.positions.length ? pieces.positions[last] : pieces.end;
	function toDoc(offset: number): number {
		return offset < positions.length ? positions[Math.max(0, offset)] : windowEnd;
	}
	function fromDoc(pos: number): number {
		return pos >= windowEnd ? positions.length : offsetOf(positions, pos);
	}
	const anchor = $anchor.parent === $head.parent ? fromDoc($anchor.pos) : fromDoc($head.pos);
	return {
		text: pieces.text.slice(first, last),
		start: positions[0] ?? windowEnd,
		selection: { start: anchor, end: fromDoc($head.pos) },
		toDoc,
		fromDoc
	};
}
