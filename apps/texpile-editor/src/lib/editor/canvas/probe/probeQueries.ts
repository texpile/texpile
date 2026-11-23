// one view's probe (18.4): positions, rects, lines, face queries and draw lists, all from the model and the layout
import { NodeSelection, TextSelection } from 'prosemirror-state';
import type { CanvasPainter, PaintFrame, ViewStyles } from '../contracts/engineTypes';
import type { CanvasHit } from '../contracts/geometryTypes';
import type { LayoutBox, LineBox, TextMeasure } from '../contracts/layoutTypes';
import type { ProbeView } from '../contracts/probeTypes';
import type { CodeIsland, MathSession } from '../contracts/sessionTypes';
import type { EditorLanguage, VisualView } from '../contracts/viewTypes';
import type { BlockFailures } from '../frame/blockFailures';
import type { FrameLoop } from '../frame/frameLoop';
import type { FaceElement } from '../tree/faceElement';
import { nodeText, type ViewQueryHost } from '../view/viewQueries';
import { DrawListRecorder } from './drawListRecorder';

export type ProbeHost = {
	readonly view: VisualView;
	pane(): string;
	path(): string;
	readonly language: EditorLanguage;
	/** the view's model, elements and index */
	readonly queries: ViewQueryHost;
	readonly frames: FrameLoop;
	readonly painter: CanvasPainter;
	readonly failures: BlockFailures;
	readonly measure: TextMeasure;
	readonly styles: Pick<ViewStyles, 'reads' | 'styleMs' | 'themeReadMs'>;
};

const TEXT_MARKER = /\u200b/g;

function boxOfNode(box: LayoutBox, offset: number): LayoutBox | null {
	if (box.node?.offset === offset) return box;
	for (const child of box.children) {
		const found = boxOfNode(child, offset);
		if (found) return found;
	}
	return null;
}

function textOf(line: LineBox): string {
	let text = '';
	for (const fragment of line.fragments) if (fragment.kind === 'text' || fragment.kind === 'generated') text += fragment.text;
	return text.replace(TEXT_MARKER, '');
}

type PaintedLine = ReturnType<ProbeView['paintedLines']>['lines'][number];

function collectLines(box: LayoutBox, x: number, y: number, into: { x: number; y: number; line: LineBox }[]): void {
	const left = x + box.x;
	const top = y + box.y;
	for (const line of box.lines ?? []) into.push({ x: left, y: top, line });
	for (const child of box.children) collectLines(child, left, top, into);
}

function describe(el: FaceElement): string {
	const classes = el.className.trim().split(/\s+/).filter(Boolean);
	return [el.tagName.toLowerCase(), ...classes].join('.');
}

function mathSessionOf(view: VisualView): MathSession | null {
	const nested = view.canvas.nested();
	return nested?.kind === 'math' ? (nested as MathSession) : null;
}

function mathProbe(view: VisualView): ProbeView['math'] {
	return {
		active() {
			const session = mathSessionOf(view);
			if (!session) return null;
			const { field } = session;
			const box = session.caretElementRect();
			return {
				pos: session.pos,
				source: field.getValue(),
				caret: session.caretClientRect(),
				offset: field.position,
				ranges: field.selection.ranges.map(([from, to]) => [from, to] as [number, number]),
				lastOffset: field.lastOffset,
				mode: field.mode,
				formula: session.formulaClientRect(),
				caretBox: box && { x: box.left, top: box.top, height: box.height },
				selectionRects: session.selectionClientRects()
			};
		},
		select(ranges) {
			const session = mathSessionOf(view);
			if (session) session.field.selection = { ranges };
		}
	};
}

export function createProbeView(host: ProbeHost): ProbeView {
	const { view } = host;
	const { index, model, elements } = host.queries;
	function client(x: number, y: number, width = 0, height = 0): DOMRect {
		return view.canvas.clientRect({ x, y, width, height });
	}

	function posOf(needle: string, nth = 0): number {
		let seen = 0;
		let found = -1;
		view.state.doc.descendants((node, pos) => {
			if (found >= 0) return false;
			for (let at = node.isText ? node.text!.indexOf(needle) : -1; at >= 0; at = node.text!.indexOf(needle, at + 1))
				if (seen++ === nth) {
					found = pos + at;
					break;
				}
			return true;
		});
		return found;
	}

	function lines(blockPos: number): ReturnType<ProbeView['lines']> {
		const entry = index.blocks[index.indexAt(blockPos)];
		const layout = model.layout(index.indexAt(blockPos));
		const boxes = (entry && boxOfNode(layout.box, blockPos - entry.pos)?.lines) || [];
		return view.canvas.geometry.linesOf(blockPos).map((line, i) => {
			const box = client(line.left, line.top, line.right - line.left, line.bottom - line.top);
			return {
				from: line.from,
				to: line.to,
				text: view.state.doc.textBetween(line.from, line.to, '\n', ' '),
				top: box.top,
				height: box.height,
				baseline: client(0, line.baseline).top,
				hyphen: !!line.hyphen,
				justified: !!boxes[i]?.justified
			};
		});
	}

	function paintedLines(): ReturnType<ProbeView['paintedLines']> {
		const frame = host.frames.lastPainted;
		const lines: PaintedLine[] = [];
		const { frames } = host.frames.stats;
		if (!frame || !host.frames.ready.ready) return { frame: frames, lines };
		const { y, height } = frame.viewport;
		for (const block of frame.blocks) {
			const found: { x: number; y: number; line: LineBox }[] = [];
			collectLines(block.layout.box, 0, block.top, found);
			for (const { x, y: top, line } of found) {
				if (top + line.y + line.height < y || top + line.y > y + height) continue;
				const box = client(x + (line.fragments[0]?.x ?? 0), top + line.y);
				lines.push({ text: textOf(line), top: box.top, baseline: client(0, top + line.baseline).top, left: box.left });
			}
		}
		return { frame: frames, lines };
	}

	function query(selector: string): ReturnType<ProbeView['query']> {
		const found: ReturnType<ProbeView['query']> = [];
		index.blocks.forEach((entry, i) => {
			const positions = elements.positions(entry, host.queries.selectedPos());
			const root = entry.elements!.dom;
			const matches = [...(root.matches(selector) ? [root] : []), ...root.querySelectorAll(selector)];
			if (!matches.length) return;
			model.layout(i);
			for (const el of matches) {
				const offset = positions.posOf(el);
				const pos = offset === null ? null : entry.pos + offset;
				found.push({
					tag: el.tagName.toLowerCase(),
					classes: el.className.trim().split(/\s+/).filter(Boolean),
					attrs: Object.fromEntries(el.getAttributeNames().map((name) => [name, el.getAttribute(name) ?? ''])),
					text: pos === null ? el.textContent.replace(TEXT_MARKER, '') : nodeText(host.queries, pos),
					rect: el.getBoundingClientRect(),
					pos
				});
			}
		});
		return found;
	}

	function drawList(blockPos: number): ReturnType<ProbeView['drawList']> {
		const at = index.indexAt(blockPos);
		const block = { index: at, pos: index.blocks[at].pos, top: model.top(at).y, layout: model.layout(at) };
		const last = host.frames.lastPainted;
		const frame: PaintFrame = last ?? {
			state: view.state,
			viewport: { x: 0, y: block.top, width: model.width, height: block.layout.height },
			zoom: 1,
			dpr: 1,
			blocks: [block],
			decorations: { inline: [], nodes: new Map(), widgets: [] },
			focus: view.canvas.focusState(),
			head: view.canvas.head()
		};
		const recorder = new DrawListRecorder(host.measure, { x: 0, y: block.top });
		host.painter.paintBlock(recorder.context, block, frame);
		return recorder.ops;
	}

	function hitAt(x: number, y: number): CanvasHit | null {
		return view.canvas.geometry.hit(view.canvas.docPoint({ x, y }));
	}

	return {
		get pane() {
			return host.pane();
		},
		language: host.language,
		get path() {
			return host.path();
		},
		posOf,
		textBetween: (from, to) => view.state.doc.textBetween(from, to, '\n', ' '),
		clientPointOf(pos, side = 1) {
			const coords = view.coordsAtPos(pos, side);
			return { x: coords.left, y: (coords.top + coords.bottom) / 2 };
		},
		rectOf(pos) {
			const rect = view.canvas.geometry.caretRect({ pos, affinity: 1 });
			return rect && view.canvas.clientRect(rect);
		},
		rectOfNode: (pos) => view.canvas.nodeClientRect(pos)?.rect ?? null,
		lines,
		paintedLines,
		query,
		drawList,
		carets: () => host.painter.carets().map((caret) => ({ ...caret, rect: view.canvas.clientRect(caret.rect) })),
		selectionRects() {
			const { selection } = view.state;
			if (selection.empty || selection instanceof NodeSelection) return [];
			// what the painter shades: the drawn blocks the range crosses too
			return view.canvas.geometry.rangeRects(selection.from, selection.to, 'line', true).map((rect) => view.canvas.clientRect(rect));
		},
		hitAt,
		hoverAt(x, y) {
			const hit = hitAt(x, y);
			return hit ? { cursor: hit.cursor, hint: hit.hint, chain: hit.chain.map(describe) } : { cursor: 'default', hint: null, chain: [] };
		},
		overlays() {
			const layer = view.dom.parentElement?.querySelectorAll<HTMLElement>('.canvas-overlay-layer [data-overlay-key]') ?? [];
			return [...layer].map((el) => ({ key: el.dataset.overlayKey ?? '', rect: el.getBoundingClientRect() }));
		},
		select(anchor, head = anchor) {
			view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor, head)));
		},
		scrollToBlock(at, offset) {
			const i = Math.max(0, Math.min(index.count - 1, at));
			const rect = view.canvas.nodeClientRect(index.blocks[i].pos)?.rect;
			const { scroller } = view.canvas;
			if (rect) scroller.scrollTop += rect.top - scroller.getBoundingClientRect().top - offset;
			return { index: i, count: index.count };
		},
		frameStats: () => host.frames.stats.report(host.styles),
		settle: () => host.frames.settle(),
		errors: () => host.failures.list(),
		math: mathProbe(view),
		islands: {
			active() {
				const nested = view.canvas.nested();
				if (nested?.kind !== 'code') return null;
				const island = nested as CodeIsland;
				return { pos: island.pos, kind: island.island, ranges: island.cm.selection.ranges.map(({ from, to }) => ({ from, to })) };
			}
		}
	};
}
