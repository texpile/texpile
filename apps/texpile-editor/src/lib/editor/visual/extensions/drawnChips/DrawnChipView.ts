// a raw chip shown as a drawing of what it prints. A click opens its panel under it (its settings, or its LaTeX when it
// has none) and the drawing stays; a chip whose source no longer draws becomes the chip's own source editor. The node keeps its
// source either way, so a file with drawn chips saves byte for byte unless a chip is edited
import type { Node } from 'prosemirror-model';
import { NodeSelection, type Selection } from 'prosemirror-state';
import type { Decoration, DecorationSource, EditorView, NodeView, ViewMutationRecord } from 'prosemirror-view';
import { undoVisual, redoVisual } from '$lib/editor/visual/visualUndo';
import type { ChipFace, ChipFaceMaker } from './chipFace';
import type { ChipReparse } from './chipReparse';
import {
	chipPanelOpenFor,
	dismissChipPanel,
	openChipPanel,
	syncChipPanel,
	type ChipPanelClose,
	type ChipSettings
} from './chipPanel.svelte';
import { UNPLACEABLE_VIEW } from '$lib/editor/visual/linebreak/paragraphItems';
import { gapAwareSelectionNear } from '$lib/editor/visual/gapSelection';

/** the chip's ordinary editor: InlineLatexView or RawLatexView */
export type SourceView = NodeView & { setSelection?(anchor: number, head: number): void };
export type SourceViewMaker = (node: Node, view: EditorView, getPos: () => number) => SourceView;

export type DrawnChipKind = {
	block: boolean;
	language: 'latex' | 'typst';
	makeFace: ChipFaceMaker;
	makeSource: SourceViewMaker;
	reparse: ChipReparse;
	/** the settings the panel shows instead of the chip's LaTeX, when the chip is one command they can hold exactly */
	settingsFor(source: string): ChipSettings | null;
	jump(label: string): void;
	jumpToDefinition(name: string): void;
};

// by node, for the keys: a chip drawn now, as ProseMirror holds it
const drawnChips = new WeakMap<Node, DrawnChipView>();

export function drawnChipOf(node: Node | null | undefined): DrawnChipView | null {
	return (node && drawnChips.get(node)) ?? null;
}

/** a drawn chip when the source draws, else the chip's ordinary editor */
export function drawnOrSource(
	node: Node,
	view: EditorView,
	getPos: () => number,
	decorations: readonly Decoration[],
	kind: DrawnChipKind
): NodeView {
	const face = kind.makeFace(node.textContent);
	return face ? new DrawnChipView(node, view, getPos, decorations, kind, face) : kind.makeSource(node, view, getPos);
}

export class DrawnChipView implements NodeView {
	dom: HTMLElement;
	private node: Node;
	private face: ChipFace | null;
	private source: SourceView | null = null;
	/** the source as it was when the panel or the source editor opened, so leaving an unedited chip only draws it again */
	private opened = '';
	/** the source the face draws, which trails the node while a command is half typed in the panel */
	private drawn = '';
	private closing = 0;

	constructor(
		node: Node,
		private view: EditorView,
		private getPos: () => number,
		private decorations: readonly Decoration[],
		private kind: DrawnChipKind,
		face: ChipFace
	) {
		this.node = node;
		this.dom = document.createElement(kind.block ? 'div' : 'span');
		this.dom.className = 'drawn-chip';
		this.face = face;
		this.showFace(face);
		this.dom.addEventListener('mousedown', this.onMouseDown);
		this.dom.addEventListener('focusout', this.onFocusOut);
	}

	/** stands in the text as one character, which the keys step over and delete */
	get character(): boolean {
		return this.face?.character === true;
	}

	/** drawn on a line of its own, which vertical arrows stop on */
	get ownLine(): boolean {
		return this.kind.block || this.face?.line === true;
	}

	private showFace(face: ChipFace): void {
		face.decorate?.(this.decorations);
		face.dom.setAttribute('contenteditable', 'false');
		this.dom.replaceChildren(face.dom);
		this.dom.classList.add('drawn-chip-face');
		// a face on a line of its own makes the chip a block, which is how the line breaker knows it ends a line
		this.dom.classList.toggle('drawn-chip-line', face.line === true);
		this.dom.toggleAttribute(UNPLACEABLE_VIEW, face.mixed === true);
		this.drawn = this.node.textContent;
		drawnChips.set(this.node, this);
	}

	openPanel(): void {
		if (!this.face || chipPanelOpenFor(this.dom)) return;
		this.opened = this.node.textContent;
		this.selectWhole();
		openChipPanel({
			anchor: this.dom,
			source: this.opened,
			language: this.kind.language,
			inline: !this.kind.block,
			settingsFor: this.kind.settingsFor,
			write: (next) => this.write(next),
			writeSetting: (next) => this.write(this.separated(next)),
			jump: this.kind.jump,
			jumpToDefinition: this.kind.jumpToDefinition,
			view: this.view,
			undo: () => undoVisual(),
			redo: () => redoVisual(),
			onClose: (how) => this.panelClosed(how)
		});
	}

	private selectWhole(): void {
		const pos = this.getPos();
		const { selection } = this.view.state;
		if (selection instanceof NodeSelection && selection.from === pos) return;
		this.view.dispatch(this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, pos)));
	}

	private write(next: string): void {
		const pos = this.getPos();
		const tr = this.view.state.tr;
		const { schema } = this.node.type;
		if (next) tr.replaceWith(pos + 1, pos + this.node.nodeSize - 1, schema.text(next));
		else tr.delete(pos + 1, pos + this.node.nodeSize - 1);
		this.view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)));
	}

	/** a source ending in a command name gets {}, so the letter after an inline chip cannot join the name */
	private separated(text: string): string {
		if (this.kind.block || this.kind.language !== 'latex' || !/\\[a-zA-Z@]+$/.test(text)) return text;
		const after = this.view.state.doc.resolve(this.getPos() + this.node.nodeSize).nodeAfter;
		return after?.isText && /^[a-zA-Z@]/.test(after.text ?? '') ? text + '{}' : text;
	}

	/** `away` is a click elsewhere, which places the caret itself; the keys that close the panel leave it after the chip */
	private panelClosed(how: ChipPanelClose): void {
		const typed = this.node.textContent;
		if (this.separated(typed) !== typed) this.write(this.separated(typed));
		const text = this.node.textContent;
		if (text !== this.opened && this.replaceByReading(text, how !== 'away')) return;
		if (text !== this.drawn) this.openSource();
		if (how === 'away') return;
		this.view.dispatch(this.view.state.tr.setSelection(this.caretAfter()).scrollIntoView());
		this.view.focus();
	}

	/** after the chip; on the next line when the chip is the end of its paragraph's last line */
	private caretAfter(): Selection {
		const { doc } = this.view.state;
		const $end = doc.resolve(this.getPos() + this.node.nodeSize);
		const endsLine = this.ownLine && $end.depth > 0 && $end.parentOffset === $end.parent.content.size;
		return gapAwareSelectionNear(doc.resolve(endsLine ? $end.after() : $end.pos), 1);
	}

	private openSource(): SourceView {
		if (this.source) return this.source;
		this.opened = this.node.textContent;
		drawnChips.delete(this.node);
		this.source = this.kind.makeSource(this.node, this.view, this.getPos);
		this.face?.destroy?.();
		this.face = null;
		this.dom.replaceChildren(this.source.dom);
		this.dom.classList.remove('drawn-chip-face', 'drawn-chip-line', 'drawn-chip-selected');
		this.dom.removeAttribute(UNPLACEABLE_VIEW);
		document.addEventListener('focusin', this.onFocusElsewhere);
		return this.source;
	}

	private dropSource(): void {
		document.removeEventListener('focusin', this.onFocusElsewhere);
		this.source?.destroy?.();
		this.source = null;
	}

	/** an edited chip is read again; otherwise back to the drawing, when the source draws again */
	private closeSource(): void {
		const text = this.node.textContent;
		if (text !== this.opened && this.replaceByReading(text, false)) return;
		const face = this.kind.makeFace(text);
		if (!face) return;
		this.dropSource();
		this.face = face;
		this.showFace(face);
	}

	/** words typed into the chip come out as text; `caretAfter` puts the caret after what replaced it */
	private replaceByReading(text: string, caretAfter: boolean): boolean {
		const nodes = this.kind.reparse(text, this.node);
		if (!nodes) return false;
		const pos = this.getPos();
		const end = pos + this.node.nodeSize;
		let tr;
		try {
			tr = this.view.state.tr.replaceWith(pos, end, nodes);
		} catch {
			return false;
		}
		if (caretAfter) tr.setSelection(gapAwareSelectionNear(tr.doc.resolve(tr.mapping.map(end)), 1));
		// the source goes first: ProseMirror may hand this view the first new node, which must arrive as a drawing
		this.dropSource();
		this.dom.replaceChildren();
		this.face?.destroy?.();
		this.face = null;
		this.view.dispatch(tr.scrollIntoView());
		if (caretAfter) this.view.focus();
		return true;
	}

	private onMouseDown = (event: MouseEvent): void => {
		if (this.source || event.button !== 0) return;
		event.preventDefault();
		this.openPanel();
	};

	// the source editor, for a chip that no longer draws: the caret left for the page or another chip. A focus-out that
	// nothing takes over is the window losing focus, or a click on something that takes none; the focus arriving anywhere
	// else later closes it then
	private onFocusOut = (event: FocusEvent): void => {
		if (this.source && event.relatedTarget !== null) this.closeSoon(event.relatedTarget as globalThis.Node);
	};
	private onFocusElsewhere = (event: FocusEvent): void => {
		if (this.source) this.closeSoon(event.target as globalThis.Node);
	};

	private closeSoon(focused: globalThis.Node): void {
		if (this.dom.contains(focused)) return;
		cancelAnimationFrame(this.closing);
		// by focus alone: a click moves ProseMirror's selection only on mouseup, after this runs
		this.closing = requestAnimationFrame(() => {
			if (this.source && this.dom.isConnected && !this.dom.contains(document.activeElement)) this.closeSource();
		});
	}

	update(node: Node, decorations: readonly Decoration[], inner: DecorationSource): boolean {
		if (node.type !== this.node.type) return false;
		const changed = node.textContent !== this.node.textContent;
		if (drawnChips.get(this.node) === this) drawnChips.delete(this.node);
		this.node = node;
		this.decorations = decorations;
		if (this.source) return this.source.update ? this.source.update(node, decorations, inner) : true;
		if (this.face) drawnChips.set(node, this);
		if (!changed && this.face) {
			this.face.decorate?.(decorations);
			return true;
		}
		const open = chipPanelOpenFor(this.dom);
		if (open) syncChipPanel(this.dom, node.textContent);
		const face = this.kind.makeFace(node.textContent);
		// a command half typed in the panel keeps its last drawing until it draws again
		if (!face && open && this.face) return true;
		if (!face) {
			this.openSource();
			return true;
		}
		this.face?.destroy?.();
		this.face = face;
		this.showFace(face);
		return true;
	}

	// a selection landing inside the chip's text (a search match, a caret placed near it) takes the chip whole
	setSelection(anchor: number, head: number): void {
		if (this.source) {
			this.source.setSelection?.(anchor, head);
			return;
		}
		queueMicrotask(() => {
			if (this.dom.isConnected && !this.source) this.selectWhole();
		});
	}

	selectNode(): void {
		if (this.source) this.source.selectNode?.();
		else this.dom.classList.add('drawn-chip-selected');
	}

	deselectNode(): void {
		this.dom.classList.remove('drawn-chip-selected');
		this.source?.deselectNode?.();
	}

	stopEvent(event: Event): boolean {
		if (this.source) return this.source.stopEvent?.(event) ?? false;
		return event.type === 'mousedown';
	}

	ignoreMutation(mutation: ViewMutationRecord): boolean {
		if (this.source) return this.source.ignoreMutation ? this.source.ignoreMutation(mutation) : mutation.type !== 'selection';
		return true;
	}

	destroy(): void {
		cancelAnimationFrame(this.closing);
		if (drawnChips.get(this.node) === this) drawnChips.delete(this.node);
		dismissChipPanel(this.dom);
		document.removeEventListener('focusin', this.onFocusElsewhere);
		this.dom.removeEventListener('mousedown', this.onMouseDown);
		this.dom.removeEventListener('focusout', this.onFocusOut);
		this.face?.destroy?.();
		this.source?.destroy?.();
	}
}
