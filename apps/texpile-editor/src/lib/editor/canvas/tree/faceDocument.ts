// a Document-like factory that makes FaceElements, so DOMSerializer builds face trees directly
import { DOMSerializer, type DOMOutputSpec, type Fragment as PMFragment } from 'prosemirror-model';
import { FaceElement, FaceText } from './faceElement';

export type FaceDocument = {
	createElement(tag: string): FaceElement;
	createElementNS(namespace: string | null, tag: string): FaceElement;
	createTextNode(text: string): FaceText;
	createDocumentFragment(): FaceElement;
};

export const faceDocument: FaceDocument = {
	createElement: (tag) => new FaceElement(tag),
	createElementNS: (namespace, tag) => new FaceElement(tag, namespace),
	createTextNode: (text) => new FaceText(text),
	createDocumentFragment: () => new FaceElement('', null, true)
};

/** prosemirror-model reads only the factory methods and node members FaceElement has */
const asDocument = faceDocument as unknown as Document;

/** a toDOM spec as a face tree; the element at the spec's 0 is the hole */
export function renderFaceSpec(spec: DOMOutputSpec): { dom: FaceElement; contentDOM: FaceElement | null } {
	const { dom, contentDOM } = DOMSerializer.renderSpec(asDocument, spec);
	const root = dom as unknown as FaceElement;
	const hole = (contentDOM ?? null) as unknown as FaceElement | null;
	if (hole) hole.hole = true;
	return { dom: root, contentDOM: hole };
}

/** a PM fragment serialized through the schema's toDOM into a fragment element */
export function serializeFaceFragment(serializer: DOMSerializer, fragment: PMFragment): FaceElement {
	return serializer.serializeFragment(fragment, { document: asDocument }) as unknown as FaceElement;
}
