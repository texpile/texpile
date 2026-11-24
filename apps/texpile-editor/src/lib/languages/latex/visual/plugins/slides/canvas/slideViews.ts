// a Beamer deck on the canvas as frameView, columnView and slides.css drew it: each frame a 16:9 box with its number,
// its chrome over the corner while it is pointed at, titles with their hints, the blocks and the columns
import type { Node } from 'prosemirror-model';
import type { Decoration } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';
import type { CanvasNodeViewConstructor, CanvasViewSet, OverlaySpec, StyleLook, VisualView } from '$lib/editor/canvas';
import { decorationAttrsOf, generatedPart, setLook } from '$lib/editor/canvas';
import { isReadOnly, openChipPanel, placedHost, redoVisual, texLength, undoVisual } from '$lib/languages/latex/visual/core';
import { readColumnWidth } from '../columnWidth';
import { changeKeepingSource } from '../keepSource';
import ColumnWidthChip from './ColumnWidthChip.svelte';
import FrameChromeOverlay from './FrameChromeOverlay.svelte';
import * as looks from './slideLooks';

type View = Parameters<CanvasNodeViewConstructor>;

function attrOf(decorations: readonly Decoration[], name: string): string | null {
	for (const decoration of decorations) {
		const value = decorationAttrsOf(decoration)[name];
		if (value) return value;
	}
	return null;
}

function holdsTitlePage(node: Node): boolean {
	return node.childCount === 1 && node.firstChild!.type.name === 'raw_latex' && /^\\titlepage\b/.test(node.firstChild!.textContent.trim());
}

function frameChrome(node: Node, view: VisualView, getPos: () => number | undefined): OverlaySpec {
	function updateAttrs(attrs: Record<string, unknown>): void {
		const pos = getPos();
		if (pos !== undefined) changeKeepingSource(view, pos, node, (tr) => tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
	}
	function addPart(type: 'frame_title' | 'frame_subtitle'): void {
		const pos = getPos();
		if (pos === undefined) return;
		// a line of its own: an argument would rewrite the frame's first line, and the comments on it
		const part = view.state.schema.nodes[type].create({ form: 'macro' });
		const at = pos + 1 + (type === 'frame_subtitle' && node.firstChild?.type.name === 'frame_title' ? node.firstChild.nodeSize : 0);
		changeKeepingSource(view, pos, node, (tr) => {
			tr.insert(at, part);
			tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView();
		});
		view.focus();
	}
	return {
		key: 'chrome',
		component: FrameChromeOverlay,
		props: { node, updateAttrs, addPart, titleSlide: holdsTitlePage(node) },
		anchor: {},
		placement: 'inFlow',
		when: 'hoveredOrCaretInside'
	};
}

function frameView(...[node, view, getPos, decorations]: View): ReturnType<CanvasNodeViewConstructor> {
	const { el } = view.canvas.build;
	const titleSlide = holdsTitlePage(node);
	const dom = el('div', 'beamer-frame');
	setLook(dom, titleSlide ? { ...looks.FRAME_LOOK, ...looks.TITLE_SLIDE_LOOK } : looks.FRAME_LOOK);
	const content = dom.appendChild(el('div', 'beamer-frame-content'));
	if (titleSlide) setLook(content, looks.WIDE_LOOK);
	const slide = /\bnoframenumbering\b/.test(String(node.attrs.options)) ? null : attrOf(decorations, 'data-slide');
	if (slide) dom.appendChild(generatedPart(slide, looks.SLIDE_NUMBER_LOOK));
	// the chrome is made again for each node the frame is, so it reads the titles the frame has now
	let chrome = frameChrome(node, view, getPos);
	return {
		dom,
		contentDOM: content,
		update(next, given) {
			if (next.type !== node.type || holdsTitlePage(next) !== titleSlide || next.attrs.options !== node.attrs.options) return false;
			if (attrOf(given, 'data-slide') !== slide) return false;
			if (chrome.props.node !== next) chrome = frameChrome(next, view, getPos);
			return true;
		},
		overlays: (ui) => (ui.readOnly ? [] : [chrome])
	};
}

function titleView(className: string, look: StyleLook): CanvasNodeViewConstructor {
	return (node, view, getPos, decorations) => {
		const dom = view.canvas.build.el('div', className);
		const pos = getPos();
		const $pos = pos === undefined ? null : view.state.doc.resolve(pos);
		const after = $pos ? $pos.parent.maybeChild($pos.index() + 1) : null;
		const gap = className === 'slide-subtitle' || after?.type.name !== 'frame_subtitle';
		setLook(dom, { position: 'relative', ...look, ...(gap ? looks.TITLE_GAP_LOOK : {}) });
		const hint = node.content.size === 0 ? attrOf(decorations, 'data-hint') : null;
		if (hint) dom.generatedBefore = generatedPart(hint, looks.TITLE_HINT_LOOK);
		return {
			dom,
			contentDOM: dom,
			update: (next, given) => next.type === node.type && (next.content.size === 0) === !!hint && !!attrOf(given, 'data-hint') === !!hint
		};
	};
}

function blockView(...[node, view]: View): ReturnType<CanvasNodeViewConstructor> {
	const dom = view.canvas.build.el('div', 'beamer-block');
	dom.setAttribute('data-kind', String(node.attrs.kind));
	setLook(dom, looks.blockLook(node.attrs.kind));
	return { dom, contentDOM: dom, update: (next) => next.type === node.type && next.attrs.kind === node.attrs.kind };
}

function blockTitleView(...[node, view, getPos, decorations]: View): ReturnType<CanvasNodeViewConstructor> {
	const dom = view.canvas.build.el('div', 'beamer-block-title');
	const pos = getPos();
	const kind = pos === undefined ? 'block' : view.state.doc.resolve(pos).parent.attrs.kind;
	setLook(dom, looks.blockTitleLook(kind));
	const hint = node.content.size === 0 ? attrOf(decorations, 'data-hint') : null;
	if (hint) dom.generatedBefore = generatedPart(hint, looks.BLOCK_TITLE_HINT_LOOK);
	return { dom, contentDOM: dom, update: (next) => next.type === node.type && (next.content.size === 0) === !!hint };
}

function columnsView(...[, view]: View): ReturnType<CanvasNodeViewConstructor> {
	const dom = view.canvas.build.el('div', 'beamer-columns');
	setLook(dom, looks.COLUMNS_LOOK);
	return { dom, contentDOM: dom };
}

function openWidth(view: VisualView, getPos: () => number | undefined, chip: DOMRect): void {
	const pos = getPos();
	const node = pos === undefined ? null : view.state.doc.nodeAt(pos);
	if (pos === undefined || !node) return;
	const placed = placedHost(view, () => ({ x: chip.left, y: chip.top, width: chip.width, height: chip.height }));
	function write(next: string): void {
		const at = getPos();
		const current = at === undefined ? null : view.state.doc.nodeAt(at);
		const width = readColumnWidth(next);
		if (at === undefined || !current || width === null || width === current.attrs.width) return;
		changeKeepingSource(view, at, current, (tr) => tr.setNodeMarkup(at, undefined, { ...current.attrs, width }));
	}
	openChipPanel({
		anchor: placed.host,
		source: String(node.attrs.width),
		language: 'latex',
		inline: true,
		settingsFor: () => null,
		write,
		writeSetting: write,
		jump: () => {},
		jumpToDefinition: () => {},
		view,
		undo: () => undoVisual(),
		redo: () => redoVisual(),
		onClose(how) {
			placed.remove();
			if (how !== 'away') view.focus();
		}
	});
}

function columnView(...[node, view, getPos]: View): ReturnType<CanvasNodeViewConstructor> {
	const { el } = view.canvas.build;
	const width = String(node.attrs.width);
	const length = texLength(width);
	const share = length && 'share' in length && length.share > 0 ? Math.min(length.share, 1) : null;
	const dom = el('div', 'beamer-column');
	setLook(dom, { minWidth: '0', flex: share === null ? '1 1 0' : `0 1 ${share * 100}%` });
	const head = dom.appendChild(el('div', 'beamer-column-width'));
	head.anchor = 'width';
	setLook(head, looks.COLUMN_HEAD_LOOK);
	const content = dom.appendChild(el('div', 'beamer-column-content'));
	const chip: OverlaySpec = {
		key: 'width',
		component: ColumnWidthChip,
		props: { width, disabled: isReadOnly.current, onopen: (box: DOMRect) => openWidth(view, getPos, box) },
		anchor: { part: 'width' },
		placement: 'inFlow',
		when: 'hoveredOrCaretInside'
	};
	return {
		dom,
		contentDOM: content,
		update: (next) => next.type === node.type && String(next.attrs.width) === width,
		overlays: () => [chip]
	};
}

export function slideViews(): CanvasViewSet {
	return {
		nodeViews: {
			frame: frameView,
			frame_title: titleView('slide-title', looks.TITLE_LOOK),
			frame_subtitle: titleView('slide-subtitle', looks.SUBTITLE_LOOK),
			beamer_block: blockView,
			beamer_block_title: blockTitleView,
			columns: columnsView,
			column: columnView
		}
	};
}
