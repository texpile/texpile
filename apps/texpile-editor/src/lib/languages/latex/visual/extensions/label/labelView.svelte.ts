import type { EditorView, NodeView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { mount, unmount } from 'svelte';
import LabelDisplay from './LabelDisplay.svelte';
import { renameLabel } from './renameLabel';

type LabelDisplayProps = { name: string; onRename: (next: string) => void };

export class LabelView implements NodeView {
	dom: HTMLElement;
	node: PMNode;
	private svelteComponent: ReturnType<typeof mount>;
	// one $state object for every prop: svelte 5 only tracks the node's changes when they live
	// alongside the static props (same reasoning as CitationView)
	private componentProps = $state<LabelDisplayProps>() as LabelDisplayProps;

	constructor(
		node: PMNode,
		private view: EditorView,
		private getPos: () => number
	) {
		this.node = node;
		this.dom = document.createElement('span');
		// kills the stray whitespace the svelte template would otherwise contribute
		this.dom.style.fontSize = '0';

		this.componentProps = {
			name: String(node.attrs.name ?? ''),
			onRename: (next: string) => renameLabel(this.view, this.getPos(), next)
		};

		this.svelteComponent = mount(LabelDisplay, { target: this.dom, props: this.componentProps });
	}

	update(node: PMNode): boolean {
		if (node.type !== this.node.type) return false;
		this.node = node;
		this.componentProps.name = String(node.attrs.name ?? '');
		return true;
	}

	stopEvent(event: Event): boolean {
		// arrows still belong to the editor, so the caret can walk past the chip
		if (event instanceof KeyboardEvent && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return false;
		return true;
	}

	destroy(): void {
		unmount(this.svelteComponent);
	}
}
