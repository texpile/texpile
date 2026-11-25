// a raw chip drawn as what it prints (8.3): its face's elements in the chip's wrapper. A press selects the chip whole
import { NodeSelection } from 'prosemirror-state';
import type { Decoration } from 'prosemirror-view';
import { setLook, type CanvasEvent, type CanvasNodeView, type VisualView } from '$lib/editor/canvas';
import type { ChipFace } from './chipFace';
import { openDrawnChipPanel } from './chipPanel/drawnChipPanel';
import { CHIP_LINE_LOOK, CHIP_ROOT_LOOK, CHIP_SELECTED_LOOK, chipElement } from './looks/chipLooks';

const DRAWN_CHIP_SELECTED = 'drawn-chip-selected';

/** a press, Enter on its selection or the Insert menu open a drawn chip: it is selected whole and its panel opens under it */
export function openDrawnChip(view: VisualView, pos: number): void {
	const { state } = view;
	const { selection } = state;
	if (!(selection instanceof NodeSelection && selection.from === pos))
		view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
	if (!view.hasFocus()) view.focus();
	openDrawnChipPanel(view, pos);
}

function pressesChip(event: CanvasEvent): boolean {
	return event.type === 'mousedown' && 'button' in event && event.button === 0 && !event.target.closest('button');
}

/** the chip is an atom for the keys: a face standing as one character says so for them (`data-chip-character`) */
export function drawnChipView(
	face: ChipFace,
	block: boolean,
	view: VisualView,
	getPos: () => number | undefined,
	decorations: readonly Decoration[]
): CanvasNodeView {
	const dom = chipElement(block ? 'div' : 'span', 'drawn-chip drawn-chip-face');
	setLook(dom, CHIP_ROOT_LOOK);
	// a face on a line of its own makes the chip a block, which is how the line breaker knows it ends a line
	if (face.line) {
		dom.classList.add('drawn-chip-line');
		setLook(dom, CHIP_LINE_LOOK);
	}
	if (face.character) dom.setAttribute('data-chip-character', '');
	face.decorate?.(decorations);
	dom.appendChild(face.dom);
	return {
		dom,
		actions: face.actions,
		selectNode() {
			dom.classList.add(DRAWN_CHIP_SELECTED);
			setLook(dom, CHIP_SELECTED_LOOK);
		},
		deselectNode() {
			dom.classList.remove(DRAWN_CHIP_SELECTED);
			for (const name of ['outline', 'outline-offset']) dom.style.removeProperty(name);
		},
		stopEvent(event) {
			const pos = getPos();
			if (pos === undefined || !pressesChip(event)) return false;
			openDrawnChip(view, pos);
			return true;
		}
	};
}
