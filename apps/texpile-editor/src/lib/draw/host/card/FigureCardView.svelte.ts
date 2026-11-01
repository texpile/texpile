import { mount, unmount } from 'svelte';
import type { Node } from 'prosemirror-model';
import type { EditorView as PMView, NodeView } from 'prosemirror-view';
import type { FigureLanguage } from '$lib/draw/editor';
import { cachedDrawing, loadSavedDrawing, onDrawingsChange, pictureKey } from '../drawingCache';
import { OPEN_FIGURE, type OpenFigureDetail } from './figureEvents';
import FigureCard from './FigureCard.svelte';
import { figureSummary } from './figureSummary';

function pictureOf(language: FigureLanguage, text: string): string | null {
	const pictures = language.listPictures(text);
	if (pictures.length !== 1) return null;
	const [{ from, to }] = pictures;
	const before = text.slice(0, from).trim();
	return (before === '' || before === '#') && text.slice(to).trim() === '' ? text.slice(from, to) : null;
}

export function isFigureBlock(language: FigureLanguage, text: string): boolean {
	return pictureOf(language, text) !== null;
}

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
		const key = pictureKey(picture);
		this.card.svg = cachedDrawing(key);
		if (this.card.svg) return;
		this.card.summary = figureSummary(this.language, this.node.textContent);
		void loadSavedDrawing(key);
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
