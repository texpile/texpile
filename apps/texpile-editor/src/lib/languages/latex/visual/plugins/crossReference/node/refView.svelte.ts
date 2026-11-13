import type { Decoration, EditorView, NodeView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { mount, unmount } from 'svelte';
import { countedLabelsOf, type LabelNumbers } from '$lib/languages/latex/visual/core';
import RefDisplay from './RefDisplay.svelte';

export class RefView implements NodeView {
	dom: HTMLElement;
	private svelteComponent: ReturnType<typeof mount>;
	private componentProps = $state<{
		node: PMNode;
		view: EditorView;
		counted: LabelNumbers | null;
		onJumpToLabel?: (name: string) => boolean;
	}>();
	node: PMNode;
	private view: EditorView;

	constructor(node: PMNode, view: EditorView, decorations: readonly Decoration[], onJumpToLabel?: (name: string) => boolean) {
		this.node = node;
		this.view = view;

		// classless: an inline-block wrapper would box the reference off from the line it sits in
		this.dom = document.createElement('span');

		this.componentProps = {
			node: this.node,
			view: this.view,
			counted: countedLabelsOf(decorations),
			onJumpToLabel
		};

		this.svelteComponent = mount(RefDisplay, {
			target: this.dom,
			props: this.componentProps
		});
	}

	update(node: PMNode, decorations: readonly Decoration[]) {
		if (node.type !== this.node.type) {
			return false;
		}

		this.node = node;

		if (this.componentProps) {
			this.componentProps.node = node;
			this.componentProps.counted = countedLabelsOf(decorations);
		}

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
