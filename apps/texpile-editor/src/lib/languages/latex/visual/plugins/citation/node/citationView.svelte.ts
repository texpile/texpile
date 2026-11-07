import { chipHost, quietTemplateSpaces } from '$lib/languages/latex/visual/core';
import type { EditorView, NodeView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { mount, unmount } from 'svelte';

import { returnFocusToText } from '$lib/languages/latex/visual/core';
import CitationDisplay from './CitationDisplay.svelte';

type CitationDisplayProps = {
	node: PMNode;
	onUpdate: (attrs: { prenote?: string; postnote?: string; variant?: string }) => void;
	onChangeKey: (key: string) => void;
	onClose: () => void;
};

export class CitationView implements NodeView {
	dom: HTMLElement;
	private svelteComponent: ReturnType<typeof mount>;
	// all props in one $state object: svelte 5 only tracks node changes when it lives
	// in the same reactive object as the static props. cast: always assigned in the constructor
	private componentProps = $state<CitationDisplayProps>() as CitationDisplayProps;
	node: PMNode;
	private view: EditorView;
	private getPos: () => number;
	updating: boolean;

	constructor(node: PMNode, view: EditorView, getPos: () => number) {
		this.node = node;
		this.view = view;
		this.getPos = getPos;
		this.updating = false;

		this.dom = chipHost();

		this.forwardUpdate = this.forwardUpdate.bind(this);
		this.changeKey = this.changeKey.bind(this);

		this.componentProps = {
			node: this.node,
			onUpdate: this.forwardUpdate,
			onChangeKey: this.changeKey,
			onClose: () => returnFocusToText(this.view)
		};

		this.svelteComponent = mount(CitationDisplay, {
			target: this.dom,
			props: this.componentProps
		});
		quietTemplateSpaces(this.dom);
	}

	forwardUpdate(newAttrs: { prenote?: string; postnote?: string; variant?: string }) {
		if (this.updating) return;

		const pos = this.getPos();
		if (pos == null) return;
		const tr = this.view.state.tr;

		this.updating = true;

		tr.setNodeMarkup(pos, null, {
			...this.node.attrs,
			...newAttrs
		});

		this.view.dispatch(tr);

		this.node = this.view.state.doc.nodeAt(pos) as PMNode;
		this.componentProps.node = this.node;

		this.updating = false;
	}

	// the key is the node's text content, so changing it means swapping in a fresh node
	changeKey(newKey: string) {
		if (this.updating) return;
		const pos = this.getPos();
		if (pos == null) return;
		this.updating = true;
		const text = newKey ? this.view.state.schema.text(newKey) : null;
		const newNode = this.node.type.create(this.node.attrs, text);
		const tr = this.view.state.tr.replaceWith(pos, pos + this.node.nodeSize, newNode);
		this.view.dispatch(tr);
		this.node = this.view.state.doc.nodeAt(pos) as PMNode;
		this.componentProps.node = this.node;
		this.updating = false;
	}

	update(node: PMNode) {
		if (node.type !== this.node.type) return false;
		this.node = node;

		// don't re-render while a UI-driven update is in flight
		if (this.updating) return true;

		this.componentProps.node = this.node;

		return true;
	}

	stopEvent(event: Event) {
		// swallow everything except arrows, so the cursor can still navigate past the citation
		if (event instanceof KeyboardEvent) {
			if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
				return false;
			}
		}
		return true;
	}

	destroy() {
		unmount(this.svelteComponent);
	}
}
