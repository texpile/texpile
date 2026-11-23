import type { FaceElement } from '$lib/editor/canvas';
import type { ChipFace } from '../chipFace';
import type { ClassElement } from '../looks/chipLooks';

export type PartElement = FaceElement;

/** how a composite builds its own elements */
export type PartMode = {
	make(tag: string, className?: string, text?: string): PartElement;
	/** an element of a part, in this mode */
	of(element: PartElement): PartElement;
	ofFace(face: ChipFace): PartElement;
};

export function elementMode(make: ClassElement): PartMode {
	return { make, of: (part) => part, ofFace: (face) => face.dom };
}

/** the parent, with the children appended: elements of its own mode, or text */
export function appendTo<T extends PartElement>(parent: T, ...children: (PartElement | string)[]): T {
	for (const child of children) (parent as unknown as { append(node: unknown): void }).append(child);
	return parent;
}

/** the parent's children replaced */
export function replaceIn(parent: PartElement, ...children: (PartElement | string)[]): void {
	(parent as unknown as { replaceChildren(...nodes: unknown[]): void }).replaceChildren(...children);
}
