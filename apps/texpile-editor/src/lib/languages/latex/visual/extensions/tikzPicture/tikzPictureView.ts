// a TikZ picture in the paper: its last drawing, or a card, and double-click to open it in a figure tab. The paper
// itself never starts TeX
import type { Node } from 'prosemirror-model';
import type { EditorView as PMView, NodeView } from 'prosemirror-view';
import { tikzLanguage } from '$lib/draw/tikz/tikzLanguage';
import { cachedDrawing, onDrawingsChange, pictureKey } from '$lib/draw/host/drawingCache';
import { OPEN_FIGURE, type OpenFigureDetail } from './openFigure';

const PREVIEW_LINES = 4;

/** a raw block that is one TikZ picture */
export function isTikzPicture(text: string): boolean {
	const pictures = tikzLanguage.listPictures(text);
	return pictures.length === 1 && text.slice(pictures[0].from, pictures[0].to).trim() === text.trim();
}

/** which picture of the file the block at `pos` is: the pictures in the raw blocks before it, counted */
function pictureIndex(view: PMView, pos: number): number {
	let index = 0;
	view.state.doc.nodesBetween(0, pos, (n) => {
		if (n.type.name === 'raw_latex') index += tikzLanguage.listPictures(n.textContent).length;
		return n.type.name !== 'raw_latex';
	});
	return index;
}

export class TikzPictureView implements NodeView {
	dom: HTMLElement;
	private node: Node;
	private readonly stopListening: () => void;

	constructor(node: Node, view: PMView, getPos: () => number) {
		this.node = node;
		this.dom = document.createElement('div');
		this.dom.className = 'tikz-picture group relative my-2 flex flex-col items-center gap-1 rounded-base border border-transparent p-2';
		this.dom.contentEditable = 'false';
		this.dom.addEventListener('dblclick', (e) => {
			e.preventDefault();
			const detail: OpenFigureDetail = { index: pictureIndex(view, getPos()), source: this.node.textContent };
			window.dispatchEvent(new CustomEvent(OPEN_FIGURE, { detail }));
		});
		this.stopListening = onDrawingsChange(() => this.show());
		this.show();
	}

	private show(): void {
		const svg = cachedDrawing(pictureKey(this.node.textContent));
		const hint = document.createElement('span');
		hint.className = 'tikz-picture-hint text-primary-600-400 text-xs opacity-0 transition-opacity group-hover:opacity-100';
		hint.textContent = 'Double-click to edit';
		if (svg) {
			const drawing = document.createElement('div');
			drawing.className = 'tikz-picture-drawing max-w-full [&>svg]:h-auto [&>svg]:max-w-full';
			drawing.innerHTML = svg;
			this.dom.replaceChildren(drawing, hint);
			return;
		}
		const card = document.createElement('div');
		card.className =
			'tikz-picture-card bg-surface-100-900 border-surface-300-700 flex w-full max-w-md flex-col gap-1 rounded-base border px-3 py-2';
		const title = document.createElement('span');
		title.className = 'text-sm font-semibold';
		title.textContent = 'TikZ figure';
		const preview = document.createElement('pre');
		preview.className = 'text-surface-600-400 m-0 overflow-hidden font-mono text-xs leading-snug whitespace-pre';
		preview.textContent = this.node.textContent.trim().split('\n').slice(0, PREVIEW_LINES).join('\n');
		card.append(title, preview);
		hint.classList.replace('opacity-0', 'opacity-70');
		this.dom.replaceChildren(card, hint);
	}

	update(node: Node): boolean {
		if (node.type !== this.node.type || !isTikzPicture(node.textContent)) return false;
		this.node = node;
		this.show();
		return true;
	}

	selectNode(): void {
		this.dom.classList.add('border-primary-500');
	}

	deselectNode(): void {
		this.dom.classList.remove('border-primary-500');
	}

	stopEvent(): boolean {
		return false;
	}

	ignoreMutation(): boolean {
		return true;
	}

	destroy(): void {
		this.stopListening();
	}
}
