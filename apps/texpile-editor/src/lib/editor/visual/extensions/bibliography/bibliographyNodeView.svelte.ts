import { mount, unmount } from 'svelte';
import type { Node } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import { NodeSelection } from 'prosemirror-state';
import BibliographyView from './BibliographyView.svelte';
import { placeholderCommand } from '../raw-latex/placeholderView';
import { printedName } from '$lib/languages/latex/visual/extensions/environment/environmentHeads';

/** what one language's bibliography command is: whether a block's text is one, and the heading it prints */
export type BibliographyKind = { owns(text: string): boolean; heading(text: string): string };

export function bibHeading(text: string): string {
	const m = text.match(/title\s*=\s*\{([^}]*)\}/) ?? text.match(/title\s*=\s*([^,\]]+)/);
	return m ? m[1].trim() : (printedName('ref', undefined) ?? 'References');
}

export const latexBibliography: BibliographyKind = {
	owns: (text) => placeholderCommand(text)?.command === 'printbibliography',
	heading: bibHeading
};

/** NodeView for \printbibliography and #bibliography: read-only preview of live reference entries. Node text stays verbatim, so the file round-trips unchanged. */
export class BibliographyNodeView implements NodeView {
	dom: HTMLElement;
	private view: EditorView;
	private getPos: () => number;
	private kind: BibliographyKind;
	private props = $state<{ heading: string; selected: boolean }>({ heading: 'Bibliography', selected: false });
	private component: Record<string, unknown> | null = null;

	constructor(node: Node, view: EditorView, getPos: () => number, kind: BibliographyKind) {
		this.view = view;
		this.getPos = getPos;
		this.kind = kind;
		this.props.heading = kind.heading(node.textContent);

		const el = document.createElement('div');
		el.className = 'latex-bibliography';
		el.setAttribute('contenteditable', 'false');
		el.title = node.textContent.trim();
		// click selects the whole node (so Backspace removes it) instead of editing the preview
		el.addEventListener('mousedown', (e) => {
			e.preventDefault();
			this.selectWhole();
		});
		this.dom = el;
		this.component = mount(BibliographyView, { target: el, props: this.props });
	}

	private selectWhole() {
		const pos = this.getPos();
		if (pos != null) this.view.dispatch(this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, pos)));
	}

	update(node: Node): boolean {
		if (!this.kind.owns(node.textContent)) return false;
		this.props.heading = this.kind.heading(node.textContent);
		return true;
	}
	// the arrow keys put a caret inside the text the card does not show: it takes the whole card, as a click does
	setSelection() {
		queueMicrotask(() => {
			if (this.dom.isConnected) this.selectWhole();
		});
	}
	selectNode() {
		this.props.selected = true;
	}
	deselectNode() {
		this.props.selected = false;
	}
	stopEvent() {
		return false;
	}
	ignoreMutation() {
		return true;
	}
	destroy() {
		if (this.component) unmount(this.component);
	}
}
