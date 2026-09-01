import type { EditorView, NodeView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { mount, unmount } from 'svelte';
import RefDisplay from './RefDisplay.svelte';

export class RefView implements NodeView {
	dom: HTMLElement;
	private svelteComponent: ReturnType<typeof mount>;
	private componentProps = $state<{
		node: PMNode;
		view: EditorView;
	}>();
	node: PMNode;
	private view: EditorView;

	constructor(node: PMNode, view: EditorView) {
		this.node = node;
		this.view = view;

		// classless: an inline-block wrapper would box the reference off from the line it sits in
		this.dom = document.createElement('span');

		this.componentProps = {
			node: this.node,
			view: this.view
		};

		this.svelteComponent = mount(RefDisplay, {
			target: this.dom,
			props: this.componentProps
		});
	}

	update(node: PMNode) {
		if (node.type !== this.node.type) {
			return false;
		}

		this.node = node;

		if (this.componentProps) this.componentProps.node = node;

		return true;
	}

	stopEvent() {
		return true; // the svelte component handles its own events
	}

	destroy() {
		if (this.svelteComponent) {
			unmount(this.svelteComponent);
		}
	}
}
