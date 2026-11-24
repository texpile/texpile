import type { VisualView } from '$lib/editor/canvas';

// by node type, for the Insert menu: an atom drawn now that edits itself in a popover (a citation)
const popovers = new Map<string, (view: VisualView, pos: number) => void>();

export function offerPopover(nodeType: string, open: (view: VisualView, pos: number) => void): void {
	popovers.set(nodeType, open);
}

/** false when the node at `pos` has no popover */
export function openPopoverOf(view: VisualView, pos: number): boolean {
	const open = popovers.get(view.state.doc.nodeAt(pos)?.type.name ?? '');
	open?.(view, pos);
	return !!open;
}
