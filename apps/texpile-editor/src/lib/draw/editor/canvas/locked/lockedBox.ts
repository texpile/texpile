import { subtree } from '../../objects/statementTree';
import type { FigureEditorState } from '../../state/editorState.svelte';
import { unionBox } from '../../state/snapTargets';

const PAD_PX = 4;

/** the box around a statement and what is in it, padded as a selection's is, in bp */
export function lockedBox(ed: FigureEditorState, i: number) {
	const inside = new Set(subtree(ed.tree, i));
	const box = unionBox(ed.snapBoxes.filter((b) => inside.has(b.stmt)));
	if (!box) return null;
	const pad = PAD_PX / ed.viewport.scale;
	return { x: box.x1 - pad, y: box.y1 - pad, w: box.x2 - box.x1 + 2 * pad, h: box.y2 - box.y1 + 2 * pad };
}
