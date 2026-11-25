// dispatch and updateState, in prosemirror-view's order: props, blocks, views, nested editors, signal, plugin views, scroll
import { NodeSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { StepMap, type Mappable } from 'prosemirror-transform';
import { CARET_AFFINITY_META, type Affinity } from '../contracts/geometryTypes';
import type { NestedEditor } from '../contracts/nodeViewTypes';
import type { MathSession } from '../contracts/sessionTypes';
import type { ViewDragging } from '../contracts/viewTypes';
import type { BlockElements } from '../document/blockElements';
import type { BlockIndex } from '../document/blockIndex';
import type { ViewDocument } from '../document/viewDocument';
import type { SelectionSignal } from '../interaction/focus/selectionSignal';
import { viewDecorationSource } from '../tree/decorationElements';
import { TrackedPositions } from '../overlays/trackedPositions';
import type { NestedEditors } from '../views/nestedEditors';
import type { DomEventListeners } from './domEvents';
import type { PluginViews } from './pluginViews';
import { POINTER_DRAG_META } from '../interaction/pointer/autoscroll';
import type { RevealPolicy } from './reveal';
import type { ViewProps } from './viewProps';

/** the view's fields an update writes; the rest it reaches through the parts below */
export type ViewFields = {
	state: EditorState;
	editable: boolean;
	dragging: ViewDragging | null;
	affinity: Affinity;
};

export type DispatchParts = {
	/** what dispatchTransaction, plugin views and handlers are called with */
	readonly exposed: EditorView;
	readonly fields: ViewFields;
	readonly props: ViewProps;
	readonly pluginViews: PluginViews;
	readonly listeners: DomEventListeners;
	readonly index: BlockIndex;
	readonly elements: BlockElements;
	readonly model: ViewDocument;
	readonly reveal: RevealPolicy;
	readonly signal: SelectionSignal;
	readonly nested: NestedEditors;
	/** the root and the mirror host, which wear the attributes props */
	readonly attributed: readonly HTMLElement[];
	scroller(): HTMLElement;
	requestFrame(): void;
	/** the document changed: the reading place decides which line it holds; null when no transaction maps prev to state */
	docChanged(mapping: Mappable | null): void;
};

export class DispatchCycle {
	/** what overlays stand on, mapped through each transaction (12.1) */
	readonly tracked = new TrackedPositions();
	private transaction: Transaction | null = null;

	constructor(private readonly parts: DispatchParts) {}

	/** bound by the view: runs dispatchTransaction, else applies the transaction itself */
	dispatch(tr: Transaction): void {
		const { parts } = this;
		if (tr.selectionSet || tr.docChanged) parts.fields.affinity = tr.getMeta(CARET_AFFINITY_META) === -1 ? -1 : 1;
		const outer = this.transaction;
		this.transaction = tr;
		try {
			const dispatchTransaction = parts.props.props.dispatchTransaction;
			if (dispatchTransaction) dispatchTransaction.call(parts.exposed, tr);
			else this.update(parts.fields.state.apply(tr), parts.fields.state);
		} finally {
			this.transaction = outer;
		}
	}

	/** null prev: the first update, made at construction */
	update(state: EditorState, prev: EditorState | null, changed?: { plugins: boolean; handlers: boolean }): void {
		const { parts } = this;
		const { fields } = parts;
		fields.state = state;
		parts.props.propsFor(state);
		if (!prev || changed?.plugins || changed?.handlers || prev.plugins !== state.plugins) parts.listeners.ensure();
		fields.editable = !parts.exposed.someProp('editable', (f) => f(state) === false);
		this.applyAttributes(state);
		if (prev && prev.doc !== state.doc) {
			parts.model.replaced(parts.index.update(state.doc));
			const mapping = mappingBetween(this.transaction, prev, state);
			this.tracked.map(mapping);
			parts.docChanged(mapping);
		}
		parts.elements.setDecorations(state.doc, viewDecorationSource(parts.exposed));
		// the formula a session edits wears the selected class as a node selection would (D23)
		if (prev) parts.nested.sync(prev, this.transaction);
		parts.elements.markSelection(parts.index, selectedPos(state, parts.nested));
		if (prev) {
			parts.model.breakingChanged(prev, state);
			parts.signal.update(prev.selection, state.selection);
		}
		parts.pluginViews.update(state, parts.props.directPlugins, prev);
		if (prev) this.afterUpdate(prev, state);
		parts.requestFrame();
	}

	private applyAttributes(state: EditorState): void {
		const { props, exposed, attributed } = this.parts;
		props.applyAttributes(
			props.attributesFor(state, (f) => exposed.someProp('attributes', f)),
			attributed
		);
	}

	private afterUpdate(prev: EditorState, state: EditorState): void {
		const { fields } = this.parts;
		if (fields.dragging?.node && !prev.doc.eq(state.doc)) fields.dragging = draggedNodeAfter(fields.dragging, prev, state);
		if (prev.plugins !== state.plugins && !prev.doc.eq(state.doc)) this.parts.scroller().scrollTop = 0;
		else if (!this.transaction?.getMeta(POINTER_DRAG_META)) this.parts.reveal.afterUpdate(prev, state, this.transaction);
	}
}

/** the transaction's mapping plus one step over what its appended transactions changed; null for a transaction from another document */
function mappingBetween(tr: Transaction | null, prev: EditorState, state: EditorState): Mappable | null {
	if (!tr || tr.before !== prev.doc) return null;
	if (tr.doc === state.doc) return tr.mapping;
	const start = tr.doc.content.findDiffStart(state.doc.content);
	const end = start === null ? null : tr.doc.content.findDiffEnd(state.doc.content);
	if (start === null || !end) return tr.mapping;
	// findDiffEnd runs back over text the two share on both sides of an insert
	const overlap = Math.max(0, start - Math.min(end.a, end.b));
	const mapping = tr.mapping.slice();
	mapping.appendMap(new StepMap([start, end.a + overlap - start, end.b + overlap - start]));
	return mapping;
}

/** the node that wears its selected class: the node selection's, or the formula a math session edits */
export function selectedPos(state: EditorState, nested: { active(): NestedEditor | null }): number | null {
	if (state.selection instanceof NodeSelection) return state.selection.from;
	const editor = nested.active();
	return editor?.kind === 'math' ? (editor as MathSession).pos : null;
}

/** prosemirror-view's updateDraggedNode: the dragged node found again where it is now, or dropped */
function draggedNodeAfter(dragging: ViewDragging, prev: EditorState, state: EditorState): ViewDragging {
	const selected = dragging.node!;
	let found = -1;
	if (selected.from < state.doc.content.size && state.doc.nodeAt(selected.from) === selected.node) found = selected.from;
	else {
		const moved = selected.from + (state.doc.content.size - prev.doc.content.size);
		if (moved > 0 && moved < state.doc.content.size && state.doc.nodeAt(moved) === selected.node) found = moved;
	}
	return { slice: dragging.slice, move: dragging.move, node: found < 0 ? undefined : NodeSelection.create(state.doc, found) };
}
