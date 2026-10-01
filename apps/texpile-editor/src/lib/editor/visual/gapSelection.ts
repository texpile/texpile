// The selection for a caret leaving an embedded editor (MathLive, CodeMirror) at its edge.
//
// Selection.near only knows text and node selections - it NEVER returns a gap cursor, so at a
// boundary with no adjacent textblock (doc edge, another island) it either node-selects the
// block just exited (whose selectNode refocuses it: the caret visibly bounces back inside) or
// lands back inside the block. The trailing-paragraph plugin used to paper over this by forcing
// an empty paragraph after every island; with that gone, the boundary itself is the landing
// zone: an explicit gap cursor when the position admits one, Selection.near otherwise. valid()
// is false whenever a textblock neighbors the position, so a real paragraph next door still
// wins - the gap cursor only appears where there is genuinely nothing to land in.
import { Selection } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import type { ResolvedPos } from 'prosemirror-model';

// valid() is real at runtime but flagged @internal, so the .d.ts hides it; the plugin itself
// gates every gap cursor it creates on exactly this predicate, which is why we must too - a
// reimplementation would drift from whatever the installed plugin actually accepts
const gapCursorValid = (GapCursor as unknown as { valid($pos: ResolvedPos): boolean }).valid.bind(GapCursor);

/** a gap cursor at `$pos`, when the plugin would accept one there */
export function gapCursorAt($pos: ResolvedPos): GapCursor | null {
	return gapCursorValid($pos) ? new GapCursor($pos) : null;
}

export function gapAwareSelectionNear($pos: ResolvedPos, dir: number): Selection {
	return gapCursorAt($pos) ?? Selection.near($pos, dir);
}
