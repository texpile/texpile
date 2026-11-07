import { mount, unmount } from 'svelte';
import type { Node } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import { NodeSelection } from 'prosemirror-state';
import BibliographyView from './BibliographyView.svelte';
import { placeholderCommand } from '../raw-latex/placeholderView';
import { printedName } from '$lib/languages/latex/visual/extensions/environment/environmentHeads';

export function bibHeading(text: string): string {
	const m = text.match(/title\s*=\s*\{([^}]*)\}/) ?? text.match(/title\s*=\s*([^,\]]+)/);
	return m ? m[1].trim() : (printedName('ref', undefined) ?? 'References');
}

/** NodeView for \printbibliography: read-only preview of live reference entries. Node text stays verbatim, so the .tex round-trips unchanged. */
export class BibliographyNodeView implements NodeView {
	dom: HTMLElement;
	private view: EditorView;
	private getPos: () => number;
	private props = $state<{ heading: string; selected: boolean }>({ heading: 'Bibliography', selected: false });
	private component: Record<string, unknown> | null = null;

	constructor(node: Node, view: EditorView, getPos: () => number) {
		this.view = view;
		this.getPos = getPos;
		this.props.heading = bibHeading(node.textContent);

		const el = document.createElement('div');
		el.className = 'latex-bibliography';
		el.setAttribute('contenteditable', 'false');
		el.title = node.textContent.trim();
		// click selects the whole node (so Backspace removes it) instead of editing the preview
		el.addEventListener('mousedown', (e) => {
			e.preventDefault();
			const pos = this.getPos();
			if (pos != null) this.view.dispatch(this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, pos)));
		});
		this.dom = el;
		this.component = mount(BibliographyView, { target: el, props: this.props });
	}

	update(node: Node): boolean {
		if (placeholderCommand(node.textContent)?.command !== 'printbibliography') return false;
		this.props.heading = bibHeading(node.textContent);
		return true;
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
