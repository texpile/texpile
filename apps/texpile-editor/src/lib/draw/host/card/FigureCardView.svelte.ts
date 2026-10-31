// a figure in the paper, TikZ in LaTeX or CeTZ in Typst: its last drawing, or a card, and double-click to open it in a
// figure tab. The paper itself never starts TeX or Typst
import { mount, unmount } from 'svelte';
import type { Node } from 'prosemirror-model';
import type { EditorView as PMView, NodeView } from 'prosemirror-view';
import type { FigureLanguage } from '$lib/draw/editor';
import { cachedDrawing, onDrawingsChange, pictureKey } from '../drawingCache';
import { OPEN_FIGURE, type OpenFigureDetail } from './figureEvents';
import FigureCard from './FigureCard.svelte';
import { figureSummary } from './figureSummary';

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
	private readonly card = $state({ svg: null as string | null, title: '', summary: '', onedit: () => {} });
	private readonly mounted: ReturnType<typeof mount>;
	private readonly stopListening: () => void;

	constructor(
		node: Node,
		view: PMView,
		getPos: () => number,
		private readonly language: FigureLanguage,
		/** the card's name for a picture never drawn yet: TikZ figure, CeTZ figure */
		title: string
	) {
		this.node = node;
		this.dom = document.createElement('div');
		this.dom.className = 'figure-card group relative my-2 flex justify-center rounded-base border border-transparent p-2';
		this.dom.contentEditable = 'false';
		const open = () => {
			const detail: OpenFigureDetail = {
				index: pictureIndex(language, view, getPos()),
				source: pictureOf(language, this.node.textContent) ?? ''
			};
			window.dispatchEvent(new CustomEvent(OPEN_FIGURE, { detail }));
		};
		this.dom.addEventListener('dblclick', (e) => {
			e.preventDefault();
			open();
		});
		this.card.title = title;
		this.card.onedit = open;
		this.mounted = mount(FigureCard, { target: this.dom, props: this.card });
		this.stopListening = onDrawingsChange(() => this.show());
		this.show();
	}

	private show(): void {
		const picture = pictureOf(this.language, this.node.textContent) ?? '';
		this.card.svg = cachedDrawing(pictureKey(picture));
		if (!this.card.svg) this.card.summary = figureSummary(this.language, this.node.textContent);
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

	stopEvent(event: Event): boolean {
		return event.target instanceof Element && !!event.target.closest('button');
	}

	ignoreMutation(): boolean {
		return true;
	}

	destroy(): void {
		this.stopListening();
		void unmount(this.mounted);
	}
}
