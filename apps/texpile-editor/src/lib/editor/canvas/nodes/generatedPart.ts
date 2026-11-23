import type { StyleLook } from '../contracts/styleTypes';
import { faceElement, type FaceElement } from '../tree/faceElement';
import { setLook } from '../tree/faceStyle';

/** a host's generated text (a number, a marker): no position of its own, left out of copy */
export function generatedPart(text: string, look: StyleLook): FaceElement {
	const part = faceElement('span');
	part.generated = true;
	part.textContent = text;
	setLook(part, look);
	return part;
}
