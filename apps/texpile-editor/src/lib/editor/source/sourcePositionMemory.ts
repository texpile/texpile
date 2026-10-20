// Remembers where the user was in a source file - caret plus first visible line - and puts
// the viewport back there on remount.
import { EditorView } from '@codemirror/view';
import { Text } from '@codemirror/state';
import { flashLineEffect } from '$lib/languages/latex/source/synctexFlash';
import { docPositions, resolvePosition } from '$lib/workspace/docPositions';

export class SourcePositionMemory {
	// cached as it moves, because onDestroy IS the tab switch and can run detached, where
	// getBoundingClientRect reads all zeros and every line resolves to line 1
	private lastVisibleLine = 1;
	private lastVisibleOffset = 0;

	private capture(view: EditorView): void {
		const rect = view.scrollDOM.getBoundingClientRect();
		if (rect.height === 0) return; // detached or hidden: the last good value stands
		const topH = rect.top - view.documentTop; // viewport top, in document height coordinates
		const block = view.lineBlockAtHeight(topH);
		this.lastVisibleLine = view.state.doc.lineAt(Math.min(block.from, view.state.doc.length)).number;
		// how far INTO that line the viewport starts, which is what makes the restore exact rather
		// than snapped to a line boundary
		this.lastVisibleOffset = Math.max(0, Math.round(topH - block.top));
	}

	/** Snapshot the caret and first visible line for docPositions. Line/column rather than an
	 *  offset: this file can change on disk between sessions, and a line survives that far better. */
	remember(view: EditorView | null, docPath: string | null): void {
		if (!view || !docPath) return;
		this.capture(view);
		const head = view.state.selection.main.head;
		const line = view.state.doc.lineAt(head);
		docPositions.set(docPath, {
			row: line.number - 1,
			column: head - line.from,
			firstVisibleLine: this.lastVisibleLine,
			offset: this.lastVisibleOffset
		});
	}
}

/** The saved place to restore at mount, resolved against the initial text. A mode-switch anchor
 *  outranks it, and gotoLine outranks both. */
export function restorePoint(
	docPath: string | null,
	hasModeSwitchAnchor: boolean,
	initialDoc: string
): { restored: { scroll: number; cursor: number } | null; offset: number } {
	const saved = !hasModeSwitchAnchor && docPath ? docPositions.get(docPath) : null;
	// Text.of, not a throwaway EditorState, which would parse the whole paper twice per open
	const restored = saved ? resolvePosition(saved, Text.of(initialDoc.split('\n'))) : null;
	return { restored, offset: saved?.offset ?? 0 };
}

/** adds the remembered fraction of the line back, so the restore is not snapped to a line
 *  boundary. a frame late because the height is only known once CM has measured it */
export function reapplyScrollOffset(getView: () => EditorView | null, scroll: number, px: number): void {
	requestAnimationFrame(() => {
		const view = getView();
		if (!view) return;
		const block = view.lineBlockAt(scroll);
		view.scrollDOM.scrollTop += Math.min(px, Math.max(0, block.height - 1));
	});
}

/** mode-switch sync: park the caret at the visual editor's caret and flash its line. The viewport
 *  keeps the reading position (the visual editor's top block) when the caret falls inside it from
 *  there; a caret further down is brought into view instead, which is what the switch is for */
export function applyModeSwitchAnchor(view: EditorView, anchor: { scroll: number | null; cursor: number | null }): void {
	const len = view.state.doc.length;
	function clamp(p: number) {
		return Math.min(Math.max(0, p), len);
	}
	const scrollPos = anchor.scroll != null ? clamp(anchor.scroll) : null;
	const cursorPos = anchor.cursor != null ? clamp(anchor.cursor) : scrollPos;
	if (cursorPos == null) return;
	// line heights are estimates until the first measure; a long wrapped line reads as one line
	// here, which the check after the measure below makes up for
	const height = view.scrollDOM.clientHeight || window.innerHeight;
	const anchored =
		scrollPos != null && scrollPos <= cursorPos && view.lineBlockAt(cursorPos).bottom - view.lineBlockAt(scrollPos).top <= height - 12;
	view.dispatch({
		selection: { anchor: cursorPos },
		effects: [
			flashLineEffect.of(cursorPos),
			anchored ? EditorView.scrollIntoView(scrollPos!, { y: 'start', yMargin: 12 }) : EditorView.scrollIntoView(cursorPos, { y: 'center' })
		]
	});
	caretIntoView(view, cursorPos);
}

/** once CodeMirror has measured, the caret's true place is known: brought into view where the
 *  estimate above left it outside. Two frames on, after the scroll the dispatch asked for */
function caretIntoView(view: EditorView, pos: number): void {
	requestAnimationFrame(() =>
		requestAnimationFrame(() => {
			if (!view.dom.isConnected) return;
			const c = view.coordsAtPos(pos);
			const r = view.scrollDOM.getBoundingClientRect();
			if (!c || r.height === 0 || (c.top >= r.top && c.bottom <= r.bottom)) return;
			view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'nearest', yMargin: 24 }) });
		})
	);
}
