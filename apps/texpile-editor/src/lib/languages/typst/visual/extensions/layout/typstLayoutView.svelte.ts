import type { Node } from 'prosemirror-model';
import type { EditorView, NodeView, ViewMutationRecord } from 'prosemirror-view';
import { mount, unmount } from 'svelte';
import { undoVisual, redoVisual } from '$lib/editor/visual/visualUndo';
import {
	chipPanelOpenFor,
	dismissChipPanel,
	openChipPanel,
	syncChipPanel
} from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
import { readTypstCall } from '../../core/reading/typstCall';
import { argsFromField, envHeadReadsBack } from '../env/envHeadEdits';
import { layoutAttrsFor, layoutDrawing, layoutHeadSource, layoutKindOf, type LayoutKind } from './layoutDrawing';
import { layoutSettings } from './layoutSettings';
import { addGridCell, removeGridCell } from './gridCells';
import TypstLayoutGear from './TypstLayoutGear.svelte';
import { markGearPlace, offerBlockSettings } from '$lib/editor/visual/extensions/blockHandle/blockSettings';
import { m } from '$lib/paraglide/messages';
import './typstLayout.css';

function readHead(head: string): { name: string; args: string | null } | null {
	const call = readTypstCall(head);
	if (!call || call.open === null || call.close === null) return null;
	return { name: call.name, args: head.slice(call.open + 1, call.close) };
}

function toDashed(property: string): string {
	return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function paint(element: HTMLElement, style: Record<string, string>): void {
	element.removeAttribute('style');
	for (const [property, value] of Object.entries(style)) element.style.setProperty(toDashed(property), value);
}

export class TypstLayoutView implements NodeView {
	dom: HTMLElement;
	// eslint-disable-next-line @typescript-eslint/naming-convention -- ProseMirror's NodeView name
	contentDOM: HTMLElement;
	private node: Node;
	private kind: LayoutKind;
	private gear: HTMLElement;
	// where the handle's gear stood, for the panel it opens to keep to
	private gearPlace: HTMLElement;
	private panelAnchor: HTMLElement;
	private withdrawSettings: () => void;
	private attribution: HTMLElement | null = null;
	private component: ReturnType<typeof mount>;
	// one $state object: svelte tracks the cell count only while it lives beside the static props
	private gearProps = $state<{ cells: number | null }>({ cells: null });

	constructor(
		node: Node,
		private view: EditorView,
		private getPos: () => number | undefined
	) {
		this.node = node;
		this.kind = layoutKindOf(node)!;
		this.dom = document.createElement('div');
		this.dom.className = 'typ-layout';
		this.gear = this.dom.appendChild(document.createElement('div'));
		this.gear.className = 'typ-layout-gear';
		this.gear.contentEditable = 'false';
		this.contentDOM = this.dom.appendChild(document.createElement('div'));
		this.contentDOM.className = 'typ-layout-body';
		this.gearPlace = this.dom.appendChild(document.createElement('span'));
		this.gearPlace.className = 'typ-layout-gear-place';
		this.gearPlace.contentEditable = 'false';
		this.panelAnchor = this.gear;
		this.withdrawSettings = offerBlockSettings(this.dom, {
			label: () => m.typ_layout_settings(),
			open: (gear) => {
				markGearPlace(this.gearPlace, this.dom, gear);
				this.openSettings(this.gearPlace);
			}
		});
		this.component = mount(TypstLayoutGear, {
			target: this.gear,
			props: {
				gear: this.gearProps,
				onopen: () => this.openSettings(),
				onadd: () => this.withPos((pos) => addGridCell(this.view, pos)),
				onremove: () => this.withPos((pos) => removeGridCell(this.view, pos))
			}
		});
		this.draw();
	}

	private withPos(act: (pos: number) => void): void {
		const pos = this.getPos();
		if (pos !== undefined) act(pos);
	}

	private draw(): void {
		const drawing = layoutDrawing(this.kind, this.node);
		this.dom.setAttribute('data-layout', this.kind);
		paint(this.dom, drawing.style);
		paint(this.contentDOM, drawing.bodyStyle);
		this.gearProps.cells = this.kind === 'grid' ? this.node.childCount : null;
		if (drawing.attribution && !this.attribution) {
			this.attribution = this.dom.appendChild(document.createElement('div'));
			this.attribution.className = 'typ-layout-attribution';
			this.attribution.contentEditable = 'false';
		}
		if (this.attribution) {
			this.attribution.textContent = drawing.attribution ? `- ${drawing.attribution}` : '';
			this.attribution.hidden = !drawing.attribution;
		}
	}

	private openSettings(anchor: HTMLElement = this.gear): void {
		if (chipPanelOpenFor(anchor)) return;
		this.panelAnchor = anchor;
		this.gear.setAttribute('data-open', '');
		openChipPanel({
			anchor,
			source: layoutHeadSource(this.node),
			language: 'typst',
			inline: false,
			settingsFor: layoutSettings,
			write: (next) => this.writeHead(next),
			writeSetting: (next) => this.writeHead(next),
			jump: () => {},
			jumpToDefinition: () => {},
			view: this.view,
			undo: () => undoVisual(),
			redo: () => redoVisual(),
			onClose: (how) => {
				this.gear.removeAttribute('data-open');
				if (how !== 'away') this.view.focus();
			}
		});
	}

	private writeHead(next: string): void {
		const pos = this.getPos();
		const head = readHead(next);
		if (pos === undefined || !head) return;
		const grid = this.node.type.name === 'typ_grid';
		const args = grid ? head.args : argsFromField(head.args ?? '', typeof this.node.attrs.args === 'string' ? this.node.attrs.args : null);
		if (!grid && !envHeadReadsBack(head.name, args)) return;
		const attrs = layoutAttrsFor(this.node, head.name, args);
		if (!attrs || JSON.stringify(attrs) === JSON.stringify(this.node.attrs)) return;
		this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, attrs));
	}

	update(node: Node): boolean {
		if (node.type !== this.node.type || layoutKindOf(node) !== this.kind) return false;
		this.node = node;
		this.draw();
		if (chipPanelOpenFor(this.panelAnchor)) syncChipPanel(this.panelAnchor, layoutHeadSource(node));
		return true;
	}

	stopEvent(event: Event): boolean {
		return event.target instanceof globalThis.Node && this.gear.contains(event.target);
	}

	ignoreMutation(mutation: ViewMutationRecord): boolean {
		if (mutation.type === 'selection') return false;
		if (mutation.type === 'attributes' && (mutation.target === this.dom || mutation.target === this.contentDOM)) return true;
		return !this.contentDOM.contains(mutation.target);
	}

	destroy(): void {
		this.withdrawSettings();
		dismissChipPanel(this.panelAnchor);
		void unmount(this.component);
	}
}
