import {
	chipHost,
	chipPanelOpenFor,
	dismissChipPanel,
	openFieldPanel,
	quietTemplateSpaces,
	syncChipPanel
} from '$lib/languages/latex/visual/core';
import type { EditorView, NodeView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { mount, unmount } from 'svelte';
import LabelDisplay from './LabelDisplay.svelte';
import { readLabelName, repointLabelRefs, setLabelName } from './renameLabel';

type LabelDisplayProps = { name: string; onOpen: () => void };

function labelSource(name: string): string {
	return `\\label{${name}}`;
}

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
		this.dom = chipHost();
		// the anchor a \ref jumps to, named the way tables, figures and equations name theirs
		this.dom.setAttribute('data-label', String(node.attrs.name ?? ''));

		this.componentProps = {
			name: String(node.attrs.name ?? ''),
			onOpen: () => this.openPanel()
		};

		this.svelteComponent = mount(LabelDisplay, { target: this.dom, props: this.componentProps });
		quietTemplateSpaces(this.dom);
	}

	private openPanel(): void {
		if (chipPanelOpenFor(this.dom)) return;
		const opened = String(this.node.attrs.name ?? '');
		openFieldPanel({
			anchor: this.dom,
			source: labelSource(opened),
			view: this.view,
			write: (next) => {
				const name = readLabelName(next);
				if (name) setLabelName(this.view, this.getPos(), name);
			},
			onClose: (how) => {
				repointLabelRefs(this.view, opened, String(this.view.state.doc.nodeAt(this.getPos())?.attrs.name ?? ''));
				if (how !== 'away') this.view.focus();
			}
		});
	}

	update(node: PMNode): boolean {
		if (node.type !== this.node.type) return false;
		this.node = node;
		this.componentProps.name = String(node.attrs.name ?? '');
		this.dom.setAttribute('data-label', String(node.attrs.name ?? ''));
		if (chipPanelOpenFor(this.dom)) syncChipPanel(this.dom, labelSource(String(node.attrs.name ?? '')));
		return true;
	}

	stopEvent(event: Event): boolean {
		// arrows still belong to the editor, so the caret can walk past the chip
		if (event instanceof KeyboardEvent && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return false;
		return true;
	}

	destroy(): void {
		dismissChipPanel(this.dom);
		unmount(this.svelteComponent);
	}
}
