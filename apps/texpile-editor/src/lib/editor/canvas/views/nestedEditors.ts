// who owns the caret inside a node (10.1): the nested editor of the view holding the selection, derived on every update
import { NodeSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { CanvasEvent, NestedEditor } from '../contracts/nodeViewTypes';
import type { VisualView } from '../contracts/viewTypes';
import type { NodeViewDesc } from '../tree/nodeViewDesc';
import { retargetEvent } from '../view/domEvents';

export type NestedEditorsParts = {
	readonly view: VisualView;
	/** a NodeSelection's node, or the innermost node whose content strictly holds from and to */
	holding(from: number, to: number, node: boolean): NodeViewDesc | null;
};

/** the update being synced; null outside one (a history step's own restart) */
export type SelectionUpdate = { readonly prev: EditorState; readonly tr: Transaction | null };

let syncing: SelectionUpdate | null = null;

/** what a setSelection, an end or a view built while the selection syncs reads of the update (its metas, its mapping) */
export function selectionUpdate(): SelectionUpdate | null {
	return syncing;
}

function ownsCaret(desc: NodeViewDesc | null): desc is NodeViewDesc {
	return !!desc?.spec && (!!desc.spec.setSelection || desc.spec.nested !== undefined);
}

export class NestedEditors {
	private holder: NodeViewDesc | null = null;

	constructor(private readonly parts: NestedEditorsParts) {}

	/** prosemirror-view's selectionToDOM for the views that take setSelection; a view the selection left ends its nested editor */
	sync(prev: EditorState, tr: Transaction | null): void {
		const outer = syncing;
		syncing = { prev, tr };
		try {
			this.syncHolder(tr);
		} finally {
			syncing = outer;
		}
	}

	private syncHolder(tr: Transaction | null): void {
		const { view } = this.parts;
		const { selection } = view.state;
		const isNode = selection instanceof NodeSelection;
		const found = this.parts.holding(selection.from, selection.to, isNode);
		const holder = ownsCaret(found) ? found : null;
		const left = this.holder;
		this.holder = holder;
		if (left && left !== holder) left.spec?.nested?.end('selection');
		// a view with no content takes a NodeSelection of its node as the whole of it: a formula starts its editor there
		if (!holder || (isNode && holder.contentDOM)) return;
		// editorOwnsSelection: a view that does not have the focus leaves the selection where it is; a running editor follows
		if (!holder.spec?.nested && !(view.hasFocus() || tr?.getMeta('pointer'))) return;
		const start = holder.pos() + 1;
		holder.setSelection(selection.anchor - start, selection.head - start, view);
	}

	/** eventBelongsToView for keys and the clipboard: a nested editor has the focus, so its view and those around it are asked */
	stopsEvent(event: KeyboardEvent | ClipboardEvent): boolean {
		const { holder } = this;
		if (!holder) return false;
		const retargeted = retargetEvent<Event>(event, holder.dom) as CanvasEvent;
		for (let desc: NodeViewDesc | null = holder; desc; desc = desc.parent) if (desc.stopEvent(retargeted)) return true;
		return false;
	}

	active(): NestedEditor | null {
		return this.holder?.spec?.nested ?? null;
	}

	/** the editor's focus went somewhere outside it and its overlays; a window losing the focus keeps the editor */
	focusChanged(): void {
		// a blur comes before the focus lands: the next task sees where it went
		setTimeout(() => {
			const { view } = this.parts;
			if (view.canvas.focusState() !== 'away' || !view.dom.ownerDocument.hasFocus()) return;
			this.active()?.end('blur');
		});
	}

	destroy(): void {
		this.active()?.end('destroy');
	}
}
