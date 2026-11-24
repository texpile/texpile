import type { OverlaySpec } from './faceTypes';
import type { DocRect } from './layoutTypes';

export type AnchorKey = { readonly id: number };

export type OverlayAnchor = {
	readonly key: AnchorKey;
	/** null once the anchored node is deleted */
	docRect(): DocRect | null;
	clientRect(): DOMRect | null;
	/** inside the scroller's visible box */
	visible(): boolean;
	/** floating-ui and zag: { getBoundingClientRect, contextElement: view.dom } */
	virtual(): { getBoundingClientRect(): DOMRect; contextElement: Element };
	onChange(listener: () => void): () => void;
	dispose(): void;
};

export type OverlayAnchors = {
	/** the head, or the math or island caret when an owner is active */
	caret(): OverlayAnchor;
	/** tracked through every transaction's mapping */
	node(pos: number): OverlayAnchor;
	range(from: number, to: number): OverlayAnchor;
	/** a FaceElement.anchor: 'gear', 'marker', 'handle:se', 'macro:2' */
	part(pos: number, part: string): OverlayAnchor;
};

/** an overlay a face offered, mounted at its anchor in the overlay layer */
export type MountedOverlay = { spec: OverlaySpec; anchor: OverlayAnchor };
