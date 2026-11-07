// an image drawn as the file it shows at the width and height its call gives, found as the image node finds its file
import type { Node } from 'prosemirror-model';
import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { graphicFace } from '$lib/editor/visual/extensions/drawnChips/faces/graphicFace';
import { sizeOf, type ImageDrawing } from '../reading/imageSize';
import { readTypstCall } from '../reading/typstCall';

export function imageDrawn(image: ImageDrawing): ChipFace {
	const face = graphicFace(image.path);
	if (image.width) face.dom.style.width = image.width;
	if (image.height) face.dom.style.height = image.height;
	return face;
}

export function imageNodeFace(node: Node): ChipFace {
	const call = readTypstCall(`#image("", ${String(node.attrs.options ?? '')})`);
	return imageDrawn({ path: String(node.attrs.src), width: sizeOf(call, 'width'), height: sizeOf(call, 'height') });
}
