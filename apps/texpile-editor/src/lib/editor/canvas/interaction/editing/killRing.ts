// macOS Ctrl+K and Ctrl+Y: the text killed to the end of the paragraph, and put back
import { joinForward } from 'prosemirror-commands';
import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { CanvasGeometry } from '../../contracts/geometryTypes';

export class KillRing {
	private killed = '';
	private growing = false;

	/** a kill right after another one adds to it */
	push(text: string): void {
		this.killed = this.growing ? this.killed + text : text;
		this.growing = true;
	}

	/** any key but a kill ends the run */
	close(): void {
		this.growing = false;
	}

	get text(): string {
		return this.killed;
	}
}

export function killTr(state: EditorState, _geometry: CanvasGeometry, ring: KillRing): Transaction | null {
	const { selection } = state;
	if (!(selection instanceof TextSelection) || !selection.$head.parent.inlineContent) return null;
	if (!selection.empty) {
		ring.push(state.doc.textBetween(selection.from, selection.to));
		return state.tr.deleteSelection();
	}
	const { head, $head } = selection;
	const end = $head.end();
	if (head < end) {
		ring.push(state.doc.textBetween(head, end));
		return state.tr.delete(head, end);
	}
	let joined: Transaction | null = null;
	joinForward(state, (tr) => (joined = tr));
	if (joined) ring.push('\n');
	return joined;
}

export function yankTr(state: EditorState, ring: KillRing): Transaction | null {
	return ring.text && state.selection.$head.parent.inlineContent ? state.tr.insertText(ring.text) : null;
}
