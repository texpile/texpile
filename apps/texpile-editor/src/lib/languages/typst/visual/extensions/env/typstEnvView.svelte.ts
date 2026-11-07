// NodeView for a typst environment: the header above the editable body. The header opens the chip panel on the call's
// head, which sets the node's attrs, which the serializer writes the call from; the body is ProseMirror's own
import type { Node } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import { mount, unmount } from 'svelte';
import { labelTaken } from '$lib/editor/visual/labelTaken';
import { repointRefs } from '$lib/editor/visual/repointRefs';
import { undoVisual, redoVisual } from '$lib/editor/visual/visualUndo';
import {
	chipPanelOpenFor,
	dismissChipPanel,
	openChipPanel,
	syncChipPanel
} from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
import TypstEnvHeader from './TypstEnvHeader.svelte';
import { envHeadSource, readEnvHead } from './envHeadEdits';

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

	// a head still being typed is not a call yet and waits, and so does a label another anchor holds
	function writeHead(next: string) {
		const pos = getPos();
		const head = readEnvHead(next);
		if (pos === undefined || !head) return;
		const { label } = head;
		const oldLabel = currentNode.attrs.label ?? null;
		if (label !== null && label !== oldLabel && labelTaken(view.state.doc, label, pos)) return;
		const attrs = { ...currentNode.attrs, name: head.name, args: head.args, label };
		if (JSON.stringify(attrs) === JSON.stringify(currentNode.attrs)) return;
		const tr = view.state.tr.setNodeMarkup(pos, undefined, attrs);
		// a renamed label takes its references along, in the same undo step
		if (label !== oldLabel) repointRefs(tr, view.state.doc, String(oldLabel ?? ''), String(label ?? ''));
		view.dispatch(tr);
	}

	function openSettings() {
		if (chipPanelOpenFor(header)) return;
		openChipPanel({
			anchor: header,
			source: envHeadSource(currentNode),
			language: 'typst',
			inline: false,
			settingsFor: () => null,
			write: writeHead,
			writeSetting: writeHead,
			jump: () => {},
			jumpToDefinition: () => {},
			view,
			undo: () => undoVisual(),
			redo: () => redoVisual(),
			onClose: (how) => {
				if (how !== 'away') view.focus();
			}
		});
	}

	const props = $state({ node: currentNode, onopen: openSettings });
	const component = mount(TypstEnvHeader, { target: header, props });

	return {
		dom,
		contentDOM: contentDom,
		update(newNode) {
			if (newNode.type !== currentNode.type) return false;
			currentNode = newNode;
			props.node = newNode;
			dom.setAttribute('data-typ-env', String(newNode.attrs.name ?? ''));
			if (chipPanelOpenFor(header)) syncChipPanel(header, envHeadSource(newNode));
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
			dismissChipPanel(header);
			unmount(component);
		}
	};
}
