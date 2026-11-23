// what floating-ui and zag position against in place of a DOM element (12.1)
import type { OverlayAnchor } from '../contracts/overlayTypes';

export type VirtualAnchorElement = { getBoundingClientRect(): DOMRect; contextElement: Element };

/** the anchor's client rect; a dead anchor keeps the last one, so a popover closing on it does not jump to the corner */
export function virtualAnchor(anchor: Pick<OverlayAnchor, 'clientRect'>, contextElement: Element): VirtualAnchorElement {
	let last: DOMRect | null = null;
	return {
		contextElement,
		getBoundingClientRect: () => (last = anchor.clientRect() ?? last ?? contextElement.getBoundingClientRect())
	};
}
