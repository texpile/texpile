// the text blocks a caret can stand in: not display math, code, raw blocks or chips, whose DOM the
// browser cannot edit, so a selection put there is moved somewhere else by the browser
import { Selection } from 'prosemirror-state';
import type { ResolvedPos } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

export function takesCaret(view: EditorView, blockPos: number): boolean {
	const dom = view.nodeDOM(blockPos);
	return dom instanceof HTMLElement && dom.isContentEditable;
}

/** the depth of the table `$pos` is in, 0 outside one */
export function tableDepth($pos: ResolvedPos): number {
	for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type.spec.tableRole === 'table') return d;
	return 0;
}

/** the first text block from `pos`, a position between blocks, in `dir` that takes a caret */
export function nextCaretBlock(view: EditorView, from: number, dir: -1 | 1): number | null {
	const { doc } = view.state;
	for (let pos = from; ;) {
		const next = Selection.findFrom(doc.resolve(pos), dir, true);
		if (!next) return null;
		const blockPos = next.$head.before();
		if (takesCaret(view, blockPos)) return blockPos;
		pos = dir > 0 ? next.$head.after() : blockPos;
	}
}

/** the caret position at the start (dir -1) or end (dir 1) of the document's first or last such block */
export function docEdgeCaret(view: EditorView, dir: -1 | 1): number | null {
	const { doc } = view.state;
	const blockPos = nextCaretBlock(view, dir > 0 ? doc.content.size : 0, dir > 0 ? -1 : 1);
	if (blockPos === null) return null;
	return dir > 0 ? blockPos + doc.nodeAt(blockPos)!.nodeSize - 1 : blockPos + 1;
}
