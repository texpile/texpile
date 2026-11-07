// the gap cursor plugin with its arrow keys changed: a gap stays where no text lies beside it, and an arrow walks on to the text otherwise
import { gapCursor, GapCursor } from 'prosemirror-gapcursor';
import { TextSelection, type Plugin, type Selection } from 'prosemirror-state';
import type { ResolvedPos } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { drawnChipOf } from '$lib/editor/visual/extensions/drawnChips/DrawnChipView';

/** whether a textblock is the next thing past `$pos` in `dir`, climbing out of the blocks `$pos` ends */
export function textBeside($pos: ResolvedPos, dir: -1 | 1): boolean {
	let $at = $pos;
	for (;;) {
		let node = dir > 0 ? $at.nodeAfter : $at.nodeBefore;
		if (!node) {
			if ($at.depth === 0) return false;
			$at = $at.doc.resolve(dir > 0 ? $at.after() : $at.before());
			continue;
		}
		// a block that asks for a gap beside it (a table, a code or raw block) keeps it: a paragraph goes in there
		while (node && !node.isAtom && !node.inlineContent && !node.type.spec.createGapCursor)
			node = dir > 0 ? node.firstChild : node.lastChild;
		return node !== null && !node.isAtom && !node.type.spec.createGapCursor && !drawnChipOf(node);
	}
}

const ARROWS: Record<string, -1 | 1> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };

/** the gap cursor the stock plugin would put for this key, or null */
function gapFor(stock: NonNullable<Plugin['props']['handleKeyDown']>, view: EditorView, event: KeyboardEvent): GapCursor | null {
	const made: { selection: Selection | null } = { selection: null };
	const probe = {
		state: view.state,
		dispatch: (tr: { selection: Selection }) => (made.selection = tr.selection),
		endOfTextblock: view.endOfTextblock.bind(view)
	};
	stock.call(null as never, probe as unknown as EditorView, event);
	return made.selection instanceof GapCursor ? made.selection : null;
}

export function gapCursorWithArrows(): Plugin {
	const plugin = gapCursor();
	const stock = plugin.props.handleKeyDown!;
	plugin.props.handleKeyDown = (view, event) => {
		const dir = ARROWS[event.key];
		if (!dir || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return stock.call(plugin, view, event);
		const { selection } = view.state;
		if (selection instanceof GapCursor) {
			if (!textBeside(selection.$head, dir)) return stock.call(plugin, view, event);
			view.dispatch(view.state.tr.setSelection(TextSelection.near(selection.$head, dir)).scrollIntoView());
			return true;
		}
		const gap = gapFor(stock, view, event);
		if (!gap) return false;
		// text beside the gap is the browser's to walk to, one line at a time
		return textBeside(gap.$head, dir) ? false : stock.call(plugin, view, event);
	};
	return plugin;
}
