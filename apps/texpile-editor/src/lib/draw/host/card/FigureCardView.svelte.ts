import { mount, unmount } from 'svelte';
import type { Node } from 'prosemirror-model';
import type { EditorView as PMView, NodeView } from 'prosemirror-view';
import type { FigureLanguage } from '$lib/draw/editor';
import { drawChipNode, undrawChipNode, type ChipNodeView } from '$lib/editor/visual/extensions/drawnChips/DrawnChipView';
import { cachedDrawing, loadSavedDrawing, onDrawingsChange, pictureKey } from '../drawingCache';
import { onCompiledChange, resolveCardPicture } from './compiled/compiledPictures.svelte';
import type { PictureCrop } from './compiled/renderPictureCrop';
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

export class FigureCardView implements NodeView, ChipNodeView {
	dom: HTMLElement;
	readonly ownLine = true;
	readonly character = false;
	private node: Node;
	private readonly card = $state({
		svg: null as string | null,
		compiled: null as PictureCrop | null,
		title: '',
		summary: '',
		onedit: () => {}
	});
	private readonly mounted: ReturnType<typeof mount>;
	private readonly stopListening: () => void;
	private readonly stopWatchingCompiles: () => void;
	private readonly index: () => number;
	private looked = 0;

	// fromPdf: the picture can be cropped from the compiled PDF (TikZ; CeTZ has no SyncTeX)
	constructor(
		node: Node,
		view: PMView,
		getPos: () => number,
		private readonly language: FigureLanguage,
		title: string,
		private readonly fromPdf = false
	) {
		this.index = () => pictureIndex(language, view, getPos());
		this.node = node;
		this.dom = document.createElement('div');
		this.dom.className = 'figure-card group relative my-2 flex justify-center rounded-base border border-transparent p-2';
		this.dom.contentEditable = 'false';
		this.dom.addEventListener('dblclick', (e) => {
			e.preventDefault();
			this.openPanel();
		});
		this.card.title = title;
		this.card.onedit = () => this.openPanel();
		drawChipNode(node, this);
		this.mounted = mount(FigureCard, { target: this.dom, props: this.card });
		this.stopListening = onDrawingsChange(() => this.show());
		this.stopWatchingCompiles = fromPdf ? onCompiledChange(() => this.show()) : () => {};
		this.show();
	}

	openPanel(): void {
		const detail: OpenFigureDetail = {
			index: this.index(),
			source: pictureOf(this.language, this.node.textContent) ?? ''
		};
		window.dispatchEvent(new CustomEvent(OPEN_FIGURE, { detail }));
	}

	private show(): void {
		const picture = pictureOf(this.language, this.node.textContent) ?? '';
		const key = pictureKey(picture);
		if (this.fromPdf) void this.showCompiled(key, picture);
		else this.card.svg = cachedDrawing(key);
		if (cachedDrawing(key)) return;
		this.card.summary = figureSummary(this.language, this.node.textContent);
		void loadSavedDrawing(key);
	}

	private async showCompiled(key: string, picture: string): Promise<void> {
		const look = ++this.looked;
		this.card.svg = cachedDrawing(key);
		// getPos has no answer yet inside the constructor
		await Promise.resolve();
		if (look !== this.looked) return;
		const shown = await resolveCardPicture(key, picture, this.index());
		if (look !== this.looked) return;
		this.card.svg = shown.svg;
		this.card.compiled = shown.compiled;
	}

	update(node: Node): boolean {
		if (node.type !== this.node.type || !isFigureBlock(this.language, node.textContent)) return false;
		undrawChipNode(this.node, this);
		this.node = node;
		drawChipNode(node, this);
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
		undrawChipNode(this.node, this);
		this.stopListening();
		this.stopWatchingCompiles();
		this.looked++;
		void unmount(this.mounted);
	}
}
