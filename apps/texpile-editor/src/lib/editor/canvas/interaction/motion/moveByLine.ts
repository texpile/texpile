// Home and End: the start and end of the visual line the head sits on, the end drawn on that line
import { GapCursor } from 'prosemirror-gapcursor';
import type { CaretPlace } from '../../contracts/geometryTypes';
import type { VisualView } from '../../contracts/viewTypes';
import { caretEdgeFrom } from './caretTextblocks';

/** from a gap cursor both keys go to the end of the text before it, or the start of the text after it when none stands before */
function fromGap(view: VisualView, gap: GapCursor): CaretPlace | null {
	const before = caretEdgeFrom(view, gap.head, -1);
	const pos = before ?? caretEdgeFrom(view, gap.head, 1);
	return pos === null ? null : { pos, affinity: 1 };
}

export function lineBoundaryTarget(view: VisualView, dir: -1 | 1): CaretPlace | null {
	const { selection } = view.state;
	if (selection instanceof GapCursor) return fromGap(view, selection);
	const line = view.canvas.geometry.lineOf(view.canvas.head());
	if (!line) return null;
	return dir < 0 ? { pos: line.from, affinity: 1 } : { pos: beforeLineBreak(view, line.from, line.to), affinity: -1 };
}

/** a line ended by a newline in code or a hard break holds that break; End stays in front of it */
function beforeLineBreak(view: VisualView, from: number, to: number): number {
	if (to <= from) return to;
	const before = view.state.doc.resolve(to).nodeBefore;
	if (before?.type.name === 'hard_break' || (before?.isText && before.text!.endsWith('\n'))) return to - 1;
	return to;
}
