import type { Node } from 'prosemirror-model';

// by node, for the Insert menu: an atom drawn now that edits itself in a popover (a citation)
const popovers = new WeakMap<Node, () => void>();

export function offerPopover(node: Node, open: () => void): void {
	popovers.set(node, open);
}

/** false when nothing drawn for `node` has a popover */
export function openPopoverOf(node: Node): boolean {
	const open = popovers.get(node);
	open?.();
	return !!open;
}
