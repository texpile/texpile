// Cmd+Left/Right on a Mac stop at the line edge; ProseMirror selected the block beyond and typing replaced it
import { TextSelection, type Command } from 'prosemirror-state';

function holdAtTextblockEdge(dir: -1 | 1): Command {
	return (state, _dispatch, view) =>
		state.selection instanceof TextSelection && state.selection.empty && !!view?.endOfTextblock(dir > 0 ? 'forward' : 'backward');
}

export const lineEdgeKeys: Record<string, Command> = {
	'Meta-ArrowLeft': holdAtTextblockEdge(-1),
	'Meta-ArrowRight': holdAtTextblockEdge(1)
};
