// a figure in the paper, TikZ in LaTeX or CeTZ in Typst: its last drawing, or a card, and double-click to open it in a
// figure tab. The paper itself never starts TeX or Typst
import type { Node } from 'prosemirror-model';
import type { EditorView as PMView, NodeView } from 'prosemirror-view';
import type { FigureLanguage } from '$lib/draw/editor';
import { cachedDrawing, onDrawingsChange, pictureKey } from '../drawingCache';
import { OPEN_FIGURE, type OpenFigureDetail } from './figureEvents';

const PREVIEW_LINES = 4;

/** a raw block that is one picture of the language */
/** the block's one picture as the language reads it, which leaves out Typst's `#` before a call */
function pictureOf(language: FigureLanguage, text: string): string | null {
	const pictures = language.listPictures(text);
	if (pictures.length !== 1) return null;
	const [{ from, to }] = pictures;
	const before = text.slice(0, from).trim();
	return (before === '' || before === '#') && text.slice(to).trim() === '' ? text.slice(from, to) : null;
}

/** a raw block that is one picture of the language */
export function isFigureBlock(language: FigureLanguage, text: string): boolean {
	return pictureOf(language, text) !== null;
}

/** which picture of the file the block at `pos` is: the pictures in the raw blocks before it, counted */
function pictureIndex(language: FigureLanguage, view: PMView, pos: number): number {
	let index = 0;
	view.state.doc.nodesBetween(0, pos, (n) => {
		if (n.type.name === 'raw_latex') index += language.listPictures(n.textContent).length;
		return n.type.name !== 'raw_latex';
	});
	return index;
}

export class FigureCardView implements NodeView {
	dom: HTMLElement;
	private node: Node;
	private readonly stopListening: () => void;

	constructor(
		node: Node,
		view: PMView,
		getPos: () => number,
		private readonly language: FigureLanguage,
		/** the card's name for a picture never drawn yet: TikZ figure, CeTZ figure */
		private readonly title: string
	) {
		this.node = node;
		this.dom = document.createElement('div');
		this.dom.className = 'figure-card group relative my-2 flex flex-col items-center gap-1 rounded-base border border-transparent p-2';
		this.dom.contentEditable = 'false';
		this.dom.addEventListener('dblclick', (e) => {
			e.preventDefault();
			const detail: OpenFigureDetail = {
				index: pictureIndex(language, view, getPos()),
				source: pictureOf(language, this.node.textContent) ?? ''
			};
			window.dispatchEvent(new CustomEvent(OPEN_FIGURE, { detail }));
		});
		this.stopListening = onDrawingsChange(() => this.show());
		this.show();
	}

	private show(): void {
		const svg = cachedDrawing(pictureKey(pictureOf(this.language, this.node.textContent) ?? ''));
		const hint = document.createElement('span');
		hint.className = 'figure-card-hint text-primary-600-400 text-xs opacity-0 transition-opacity group-hover:opacity-100';
		hint.textContent = 'Double-click to edit';
		if (svg) {
			const drawing = document.createElement('div');
			drawing.className = 'figure-card-drawing max-w-full [&>svg]:h-auto [&>svg]:max-w-full';
			drawing.innerHTML = svg;
			this.dom.replaceChildren(drawing, hint);
			return;
		}
		const card = document.createElement('div');
		card.className =
			'figure-card-placeholder bg-surface-100-900 border-surface-300-700 flex w-full max-w-md flex-col gap-1 rounded-base border px-3 py-2';
		const heading = document.createElement('span');
		heading.className = 'text-sm font-semibold';
		heading.textContent = this.title;
		const preview = document.createElement('pre');
		preview.className = 'text-surface-600-400 m-0 overflow-hidden font-mono text-xs leading-snug whitespace-pre';
		preview.textContent = this.node.textContent.trim().split('\n').slice(0, PREVIEW_LINES).join('\n');
		card.append(heading, preview);
		hint.classList.replace('opacity-0', 'opacity-70');
		this.dom.replaceChildren(card, hint);
	}

	update(node: Node): boolean {
		if (node.type !== this.node.type || !isFigureBlock(this.language, node.textContent)) return false;
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
