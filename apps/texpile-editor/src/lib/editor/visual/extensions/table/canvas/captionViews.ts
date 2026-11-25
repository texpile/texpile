// the caption with the number it prints before it, and the notes under the table
import type { Node as PMNode } from 'prosemirror-model';
import type { CanvasNodeViewConstructor, FaceElement } from '$lib/editor/canvas';
import { faceElement, renderFaceSpec, setLook } from '$lib/editor/canvas';
import { CAPTION_LOOK, CAPTION_PREFIX_LOOK, NOTES_LOOK } from './tableLooks';
import { captionPrefixOf } from './tableNumbers';

function rendered(node: PMNode) {
	return renderFaceSpec(node.type.spec.toDOM!(node));
}

function prefixPart(text: string): FaceElement {
	const part = faceElement('span', undefined, text);
	part.generated = true;
	setLook(part, CAPTION_PREFIX_LOOK);
	return part;
}

export function tableCaptionView(...[node, view, getPos]: Parameters<CanvasNodeViewConstructor>): ReturnType<CanvasNodeViewConstructor> {
	const { dom, contentDOM } = rendered(node);
	setLook(dom, CAPTION_LOOK);
	const { counters } = view.canvas.build;
	const pos = getPos() ?? 0;
	const text = captionPrefixOf(view, view.props.language, counters, pos);
	function show(starred: boolean): void {
		dom.setAttribute('data-starred', starred ? 'true' : 'false');
		dom.generatedBefore = starred ? null : prefixPart(text);
	}
	let starred = Boolean(node.attrs.starred);
	show(starred);
	return {
		dom,
		contentDOM,
		update(next) {
			if (Boolean(next.attrs.starred) !== starred) {
				starred = Boolean(next.attrs.starred);
				show(starred);
			}
			return true;
		}
	};
}

export function tableNotesView(...[node, view, getPos]: Parameters<CanvasNodeViewConstructor>): ReturnType<CanvasNodeViewConstructor> {
	const { dom, contentDOM } = rendered(node);
	setLook(dom, NOTES_LOOK);
	const shown = view.state.doc.resolve(getPos() ?? 0).parent.attrs.showNotes;
	if (!shown) {
		dom.className = 'table-notes hide-notes';
		setLook(dom, { display: 'none' });
	}
	return { dom, contentDOM, update: () => true };
}
