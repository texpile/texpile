// NodeView for a typst environment: the header above the editable body. Header edits set the
// node's attrs, which the serializer writes the call from; the body is ProseMirror's own
import type { Node } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import { mount, unmount } from 'svelte';
import { labelTaken } from '$lib/editor/visual/labelTaken';
import { repointRefs } from '$lib/editor/visual/repointRefs';
import TypstEnvHeader from './TypstEnvHeader.svelte';

export function typstEnvView(node: Node, view: EditorView, getPos: () => number | undefined): NodeView {
	let currentNode = node;

	const dom = document.createElement('div');
	dom.className = 'typ-environment';
	dom.setAttribute('data-typ-env', String(node.attrs.name ?? ''));

	// non-editable so ProseMirror does not treat the header as content
	const header = document.createElement('div');
	header.contentEditable = 'false';
	dom.appendChild(header);

	const contentDom = document.createElement('div');
	contentDom.className = 'typ-environment-body';
	dom.appendChild(contentDom);

	function updateAttrs(attrs: Record<string, unknown>) {
		const pos = getPos();
		if (pos === undefined) return;
		const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...currentNode.attrs, ...attrs });
		// a renamed label takes its references along, in the same undo step
		if ('label' in attrs) repointRefs(tr, view.state.doc, String(currentNode.attrs.label ?? ''), String(attrs.label ?? ''));
		view.dispatch(tr);
	}

	function taken(name: string): boolean {
		const pos = getPos();
		return pos !== undefined && labelTaken(view.state.doc, name, pos);
	}

	const props = $state({ node: currentNode, updateAttrs, labelTaken: taken });
	const component = mount(TypstEnvHeader, { target: header, props });

	return {
		dom,
		contentDOM: contentDom,
		update(newNode) {
			if (newNode.type !== currentNode.type) return false;
			currentNode = newNode;
			props.node = newNode;
			dom.setAttribute('data-typ-env', String(newNode.attrs.name ?? ''));
			return true;
		},
		// the header is svelte's; ProseMirror owns the body
		ignoreMutation(mutation) {
			return header.contains(mutation.target as HTMLElement) || mutation.target === header;
		},
		stopEvent(event) {
			const t = event.target;
			return t instanceof HTMLElement && header.contains(t);
		},
		destroy() {
			unmount(component);
		}
	};
}
