// NodeView for typ_ref (`@target`): the reference as it will read, and the citation editor it
// opens. The DOC carries only the target, its supplement and its form - resolution is pure
// display, which is what makes @key round-trip safe whichever of typst's two meanings it has.
import type { EditorView, NodeView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { mount, unmount } from 'svelte';
import TypstRefDisplay from './TypstRefDisplay.svelte';

type TypstRefDisplayProps = {
	node: PMNode;
	onUpdate: (attrs: Record<string, unknown>) => void;
	onChangeKey: (key: string) => void;
};

export class TypstRefView implements NodeView {
	dom: HTMLElement;
	node: PMNode;
	private view: EditorView;
	private getPos: () => number | undefined;
	private component: ReturnType<typeof mount>;
	// one $state object: svelte 5 tracks the node only while it lives beside the static props. cast:
	// always assigned in the constructor
	private componentProps = $state<TypstRefDisplayProps>() as TypstRefDisplayProps;

	constructor(node: PMNode, view: EditorView, getPos: () => number | undefined) {
		this.node = node;
		this.view = view;
		this.getPos = getPos;
		this.dom = document.createElement('span');
		// font-size 0 kills stray whitespace from the svelte template; the display sets its own
		this.dom.style.fontSize = '0';
		this.componentProps = {
			node,
			onUpdate: (attrs) => this.updateAttrs(attrs),
			onChangeKey: (key) => this.updateAttrs({ target: key })
		};
		this.component = mount(TypstRefDisplay, { target: this.dom, props: this.componentProps });
	}

	private updateAttrs(attrs: Record<string, unknown>): void {
		const pos = this.getPos();
		if (pos == null) return;
		this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, null, { ...this.node.attrs, ...attrs }));
	}

	update(node: PMNode): boolean {
		if (node.type !== this.node.type) return false;
		this.node = node;
		this.componentProps.node = node;
		return true;
	}

	stopEvent(event: Event): boolean {
		// everything but the arrows, so the caret can still move past the reference
		return !(event instanceof KeyboardEvent && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key));
	}

	ignoreMutation(): boolean {
		return true;
	}

	destroy(): void {
		unmount(this.component);
	}
}
