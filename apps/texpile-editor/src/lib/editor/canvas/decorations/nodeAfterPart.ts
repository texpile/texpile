// a node decoration's spec.canvasAfter: text generated after the node's content, with the look its producer gives
import type { Decoration } from 'prosemirror-view';
import type { StyleLook } from '../contracts/styleTypes';
import type { FaceElement } from '../tree/faceElement';
import { generatedPart } from '../nodes/generatedPart';

export type NodeAfterSpec = { readonly canvasAfter: { readonly text: string; readonly look: StyleLook } };

export function nodeAfterPart(decorations: readonly Decoration[]): FaceElement | null {
	for (const decoration of decorations) {
		const spec = decoration.spec as Partial<NodeAfterSpec> | undefined;
		if (spec?.canvasAfter) return generatedPart(spec.canvasAfter.text, spec.canvasAfter.look);
	}
	return null;
}
