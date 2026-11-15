// the gap cursor plugin with its arrow keys changed: a gap stays where no text lies beside it, and an arrow walks on to the text otherwise
import { gapCursor, GapCursor } from 'prosemirror-gapcursor';
import { NodeSelection, TextSelection, type EditorState, type Plugin, type Selection, type Transaction } from 'prosemirror-state';
import type { ResolvedPos } from 'prosemirror-model';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { drawnChipOf } from '$lib/editor/visual/extensions/drawnChips/DrawnChipView';

export function textBeside($pos: ResolvedPos, dir: -1 | 1): boolean {
	let $at = $pos;
	for (;;) {
		let node = dir > 0 ? $at.nodeAfter : $at.nodeBefore;
		if (!node) {
			if ($at.depth === 0) return false;
			$at = $at.doc.resolve(dir > 0 ? $at.after() : $at.before());
			continue;
		}
		while (node && !node.isAtom && !node.inlineContent && !node.type.spec.createGapCursor)
			node = dir > 0 ? node.firstChild : node.lastChild;
		return node !== null && !node.isAtom && !node.type.spec.createGapCursor && !drawnChipOf(node);
	}
}

const ARROWS: Record<string, -1 | 1> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };

type StockKeys = NonNullable<Plugin['props']['handleKeyDown']>;

function runStock(stock: StockKeys, view: EditorView, event: KeyboardEvent, dispatch: (tr: Transaction) => void): boolean {
	const probe = { state: view.state, dispatch, endOfTextblock: view.endOfTextblock.bind(view) };
	return stock.call(null as never, probe as unknown as EditorView, event) === true;
}

function gapFor(stock: StockKeys, view: EditorView, event: KeyboardEvent): GapCursor | null {
	const made: { selection: Selection | null } = { selection: null };
	runStock(stock, view, event, (tr) => (made.selection = tr.selection));
	return made.selection instanceof GapCursor ? made.selection : null;
}

// the stock plugin moves to a gap without scrolling it into view: Up to the gap above a document's first block left
// the page where it was
function moveToGap(stock: StockKeys, view: EditorView, event: KeyboardEvent): boolean {
	return runStock(stock, view, event, (tr) => view.dispatch(tr.scrollIntoView()));
}

// a block drawn with none of its text editable on screen (\tableofcontents, the bibliography) takes an arrow from the
// gap beside it whole, as a click does: left to the browser, Down from the gap above one went to the document's start
function selectDrawnBeside(view: EditorView, gap: GapCursor, dir: -1 | 1): boolean {
	const { $head } = gap;
	const node = dir > 0 ? $head.nodeAfter : $head.nodeBefore;
	const at = dir > 0 ? $head.pos : $head.pos - (node?.nodeSize ?? 0);
	const dom = node && view.nodeDOM(at);
	if (!node || !NodeSelection.isSelectable(node) || !(dom instanceof HTMLElement) || dom.isContentEditable) return false;
	if (dom.querySelector('[contenteditable="true"]')) return false;
	view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)).scrollIntoView());
	return true;
}

function gapBar(): HTMLElement {
	return Object.assign(document.createElement('div'), { className: 'ProseMirror-gapcursor' });
}

function drawGapCursor(state: EditorState): DecorationSet | null {
	if (!(state.selection instanceof GapCursor)) return null;
	// the bar holds the browser's range (holdHiddenSelection). ProseMirror read it and wrote its own between the blocks
	// again, and WebKit moved that into the next editable block: Down from a formula went to a code block further on
	return DecorationSet.create(state.doc, [Decoration.widget(state.selection.head, gapBar, { key: 'gapcursor', ignoreSelection: true })]);
}

export function heldGapCursor(): Plugin {
	const plugin = gapCursor();
	plugin.props.decorations = drawGapCursor;
	return plugin;
}

export function gapCursorWithArrows(): Plugin {
	const plugin = heldGapCursor();
	const stock = plugin.props.handleKeyDown!;
	plugin.props.handleKeyDown = (view, event) => {
		const dir = ARROWS[event.key];
		if (!dir || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return stock.call(plugin, view, event);
		const { selection } = view.state;
		if (selection instanceof GapCursor) {
			if (!textBeside(selection.$head, dir)) return moveToGap(stock, view, event) || selectDrawnBeside(view, selection, dir);
			view.dispatch(view.state.tr.setSelection(TextSelection.near(selection.$head, dir)).scrollIntoView());
			return true;
		}
		const gap = gapFor(stock, view, event);
		if (!gap) return false;
		return textBeside(gap.$head, dir) ? false : moveToGap(stock, view, event);
	};
	return plugin;
}
