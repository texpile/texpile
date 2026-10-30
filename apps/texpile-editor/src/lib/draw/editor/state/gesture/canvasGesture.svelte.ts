import { sourcePoint, type Box, type Point } from '../../figure/geometry';
import type { FigureEditorState } from '../editorState.svelte';
import type { ToolId } from '../editorState.types';
import { attachAt, nodeAt, type NodeAttachTarget } from '../../connectors/connectorTargets';
import { freePlaceNear, type GridPlace } from '../../diagrams/slotPlaces';
import { moveBranch } from '../../trees/treeCommands';
import { ancestry, clickTarget, stepIn, subtree } from '../../objects/statementTree';
import type { StatementBox } from '../snapTargets.types';
import { addDrawnShape } from './drags/addDrawnShape';
import { carriedBranch, carriedCell, landCell } from './drags/carryDrags';
import { pointsNeeded } from '../drawModes/drawModes';
import { pressText } from './textPress';
import { bindsToNodes, drawnPreview, isChainStart, isSideClick, goesOnByClicks, isStartedOver } from './drags/drawDrag';
import { TypedDraw } from '../typedDraw/typedDraw.svelte';
import { onAngleStep } from './drags/pointDrag';
import { editDragSource, endBindsToNodes, isEditDrag, placedArrowEnd } from './drags/editDrags';
import { enclosedStatements, isMarqueeStarted, marqueeBox } from './drags/marqueeDrag';
import { draggedSelection, isPastMoveThreshold, releaseSelectionMove } from './drags/selectionMove';
import { hitStatement, isInSelectionBox } from './canvasHits';
import { pressToSelect } from './selectPress';
import { GestureSnap } from './gestureSnap.svelte';
import { CLOSE_REACH_PX, isPastDragThreshold, NODE_HOVER_REACH_PX } from './gestureThresholds';
import type { EditDrag, EndAttachment, GestureDrag, GestureOffset, ShapePreview } from './canvasGesture.types';
import { connectorPress, handleDrag } from './handleDrag';
import { VIEW_TOOLS } from '../../tools/tools';

function isSamePoint(a: Point, b: Point) {
	return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
}

export class CanvasGesture {
	preview = $state.raw<ShapePreview | null>(null);
	/** a shape just written, kept on the canvas until the engine has drawn it or given up; `until` is that render's number */
	landed = $state.raw<{ shape: ShapePreview; until: number } | null>(null);
	offset = $state.raw<GestureOffset | null>(null);
	/** a locked shape clicked on, outlined with the way to unlock it until the next press */
	lockedShown = $state(0);
	/** the pointer is over the selection's box, where a press drags it */
	hoverInBox = $state(false);
	/** the box a drag on the empty canvas selects with, in bp */
	marquee = $state.raw<Box | null>(null);
	/** the node a connector's end would meet, shown while it is dragged or drawn */
	attach = $state.raw<NodeAttachTarget | null>(null);
	/** the node under the pointer, which offers to start a connector from its sides */
	hoverNode = $state.raw<StatementBox | null>(null);
	/** the free place of a diagram's grid under the pointer, which a click puts a cell in */
	hoverPlace = $state.raw<GridPlace | null>(null);
	/** the diagram cell being carried, and the free place it would land in */
	carried = $state.raw<{ i: number; to: GridPlace | null } | null>(null);
	/** the tree node a carried branch would go under */
	dropOnto = $state.raw<StatementBox | null>(null);
	/** the sides of the sheet a drag is sizing it by */
	sizing = $state<'x' | 'y' | 'xy' | null>(null);
	/** where the pointer is over the canvas, in bp; a paste goes there */
	pointer: Point | null = null;
	/** Space held: a drag pans */
	spaceDown = $state(false);
	panning = $state(false);

	/** where the pointer snaps and lines up */
	readonly snap: GestureSnap;
	/** sizes typed while a shape is drawn click by click */
	readonly typed: TypedDraw;
	#editor: FigureEditorState;
	#drag: GestureDrag | null = null;
	#pressPx: Point = [0, 0];

	constructor(editor: FigureEditorState) {
		this.#editor = editor;
		this.snap = new GestureSnap(editor);
		this.typed = new TypedDraw(editor, () => this.preview);
	}

	get carrying() {
		const [o, render] = [this.offset, this.#editor.render];
		return !!o && (o.until === null || (render.busy && render.drawnRequest < o.until));
	}

	offsetOf(i: number): Point | null {
		return this.carrying && this.offset!.ids.includes(i) ? this.offset!.by : null;
	}

	get shownPreview(): ShapePreview | null {
		if (this.preview) return this.preview;
		const l = this.landed;
		const render = this.#editor.render;
		// anything drawn since, or nothing left to draw, means the engine has caught up with it
		return l && render.busy && render.drawnRequest < l.until ? l.shape : null;
	}

	#land(shape: ShapePreview, write: () => void) {
		const before = this.#editor.source;
		write();
		const after = this.#editor.source;
		if (after !== before) this.landed = { shape, until: this.#editor.render.requested };
	}

	#attachAt(at: Point, exclude: number[] = []): EndAttachment | null {
		const ed = this.#editor;
		const target = ed.drawingMatchesText ? attachAt(ed, at, exclude) : null;
		this.attach = target;
		return target && { ref: target.ref, anchor: target.anchor, at: sourcePoint(...target.at, ed.placement) };
	}

	/** the right-click menu acts on the shape under the pointer, which joins no selection it is not in */
	contextMenu(e: MouseEvent) {
		const ed = this.#editor;
		const hit = hitStatement(ed, e.target as Element | null).i;
		const i = hit ? clickTarget(ed.tree, hit, ed.selection) : 0;
		if (!ed.selection.some((s) => subtree(ed.tree, s).includes(i))) ed.select(i);
		ed.tool = 'select';
		ed.contextMenuAt = { x: e.clientX, y: e.clientY };
	}

	/** into a selected scope, toward the shape under the pointer; else the node's text, or new text on the empty canvas */
	doubleClick(e: MouseEvent, el: Element) {
		const ed = this.#editor;
		const hit = hitStatement(ed, document.elementFromPoint(e.clientX, e.clientY));
		// a dimension written before: its value typed again, as a CAD sketch's is on a double-click
		const st = hit.i ? ed.tree.byId.get(hit.i) : undefined;
		if ((ed.tool === 'select' || ed.tool === 'dimension') && st && ed.dimension.reopen(st)) return;
		if (ed.tool !== 'select') return;
		const next = hit.i && ed.selected ? stepIn(ed.tree, hit.i, ed.selected) : null;
		if (next) ed.select(next);
		else if (ed.selectedInfo?.text || (ed.selectedConnector && hit.i === ed.selected)) ed.editingText = true;
		else if (!hit.i && !hit.locked && !ed.selection.length) {
			const at = ed.viewport.toPicture(...this.#local(e, el));
			ed.addShape({ tool: 'text', at: this.snap.placeNew(at, e), text: '' });
		}
	}

	#nearVertex(at: Point, vertex: Point) {
		const [x, y] = this.#editor.toCanvas(...vertex);
		return Math.hypot(x - at[0], y - at[1]) < CLOSE_REACH_PX / this.#editor.viewport.scale;
	}

	/** a click places the next corner of a polygon, or of a line drawn click by click; the first corner closes a
	 *  polygon, a node ends a line, and the last corner again ends either */
	#addVertex(at: Point, e: PointerEvent) {
		const p = this.preview;
		const placed = p?.tool === 'polygon' || p?.chained ? p.points.slice(0, -1) : [];
		// a line back on its first point is closed, as a polygon is, however near the pointer had to be for it to snap there
		if (p?.chained && placed.length >= 3 && (this.#nearVertex(at, placed[0]) || isSamePoint(this.snap.placeNew(at, e), placed[0]))) {
			this.preview = { ...p, points: [...placed, placed[0]] };
			this.finishClicks(true);
			return;
		}
		const onFirst = placed.length >= 3 && (this.#nearVertex(at, placed[0]) || isSamePoint(this.snap.placeNew(at, e), placed[0]));
		if (placed.length && ((p?.tool === 'polygon' && onFirst) || this.#nearVertex(at, placed.at(-1)!))) {
			this.finishClicks();
			return;
		}
		const node = p?.chained && bindsToNodes(p.tool, e) ? this.#attachAt(at) : null;
		// within the node it started in: a line inside it, from where it was pressed
		if (p && node && node.ref === p.startedIn) {
			const point = this.snap.placeNew(at, e);
			const start = p.free && p.refs[0] !== null ? [p.free] : placed;
			this.preview = { ...p, points: [...start, point, point], refs: [null, null], anchors: [null, null], free: undefined };
			return;
		}
		if (p && node) {
			this.preview = { ...p, points: [...placed, node.at], refs: [p.refs[0], node.ref], anchors: [p.anchors[0], node.anchor] };
			this.finishClicks(true);
			return;
		}
		// where the preview put it: a perpendicular is found from the last corner
		const point = this.snap.placeNew(at, e, placed.at(-1));
		const points = [...placed, point, point];
		this.preview = p?.chained ? { ...p, points } : { tool: 'polygon', points, circle: false, refs: [null, null], anchors: [null, null] };
	}

	/** true when a polygon or a line was being drawn by clicks; `ended`: its last point is placed, not the pointer's */
	finishClicks(ended = false) {
		const p = this.preview;
		this.typed.close();
		if (p?.byClicks) this.preview = null;
		if (p?.tool !== 'polygon' && !p?.chained) return !!p?.byClicks;
		this.preview = null;
		this.snap.mark = null;
		this.snap.guides = [];
		const corners = ended ? p.points : p.points.slice(0, -1);
		const ed = this.#editor;
		if (p.chained && corners.length >= 2) this.#land({ ...p, points: corners }, () => addDrawnShape(ed, { ...p, points: corners }));
		else if (corners.length >= 3) this.#land({ ...p, points: corners }, () => ed.addShape({ tool: 'polygon', points: corners }));
		return true;
	}

	/** a box's or an ellipse's next point; the last its mode takes draws it */
	#placeNext(to: Point) {
		const p = this.preview!;
		this.typed.close();
		const placed = [...p.points.slice(0, -1), to];
		if (placed.length < pointsNeeded(p.mode)) {
			this.preview = { ...p, points: [...placed, to] };
			return;
		}
		this.preview = null;
		const shape = { ...p, points: placed, byClicks: false };
		this.#land(shape, () => addDrawnShape(this.#editor, shape));
	}

	/** Enter in the typed sizes: the line's next point, or the box's far corner, where they put it */
	placeTyped() {
		const p = this.preview;
		if (!p?.chained && !p?.byClicks) return false;
		const placed = p.points.slice(0, -1);
		const to = this.typed.committed(placed, p.points.at(-1)!);
		if (!to) return false;
		if (p.byClicks) this.#placeNext(to);
		else {
			this.typed.close();
			this.preview = { ...p, points: [...placed, to, to] };
		}
		return true;
	}

	/** the preview redrawn to the sizes as they are typed */
	followTyped() {
		const p = this.preview;
		if ((!p?.chained && !p?.byClicks) || !this.pointer) return;
		const placed = p.points.slice(0, -1);
		// the sizes not typed stay on the grid, as the pointer's did
		const at = this.snap.placeNew(this.pointer, new MouseEvent('pointermove'), placed.at(-1));
		this.preview = { ...p, points: [...placed, this.typed.constrain(placed, at)] };
	}

	#local(e: MouseEvent, el: Element): Point {
		const r = el.getBoundingClientRect();
		return [e.clientX - r.left, e.clientY - r.top];
	}

	down(e: PointerEvent, el: Element) {
		const ed = this.#editor;
		// a second finger while one drags
		if (this.#drag) return false;
		this.lockedShown = 0;
		this.hoverNode = null;
		this.hoverPlace = null;
		const px = this.#local(e, el);
		const at = ed.viewport.toPicture(...px);
		if (e.button === 1 || (e.button === 0 && (this.spaceDown || ed.tool === 'hand'))) {
			this.#drag = { kind: 'pan', lastPx: px };
			this.panning = true;
			return true;
		}
		if (e.button !== 0) return false;
		if (ed.tool === 'hand') return false;
		this.#pressPx = px;
		if (ed.tool === 'select') this.#pressSelect(e, at, px);
		else this.#pressTool(e, at, ed.tool);
		return true;
	}

	#pressSelect(e: PointerEvent, at: Point, px: Point) {
		const ed = this.#editor;
		const handle = (e.target as Element).closest('[data-handle]');
		const owner = ed.selectedStatement;
		const sizer = ed.sheetHandles.find((h) => h.key === handle?.getAttribute('data-handle'));
		if (sizer && ed.frame) {
			const frame = ed.frame;
			this.#drag = { kind: 'frame', m: ed.render.transformOf(frame.i), base: ed.source, frame, axes: sizer.axes };
			this.sizing = sizer.axes;
			return;
		}
		const place = handle?.getAttribute('data-place');
		if (place) {
			const [r, c] = place.split(',').map(Number);
			const found = ed.diagram.places.find((p) => p.r === r && p.c === c);
			if (found) ed.diagram.add(found);
			return;
		}
		if (handle?.getAttribute('data-connect-from')) {
			const { drag, preview } = connectorPress(ed, handle, at);
			this.hoverNode = null;
			this.#drag = drag;
			this.preview = preview;
			return;
		}
		if (handle && owner) {
			const drag = handleDrag(ed, handle.getAttribute('data-handle')!, owner, at);
			if (drag) this.#drag = drag;
			return;
		}
		this.#drag = pressToSelect(ed, e, at, px);
	}

	#pressTool(e: PointerEvent, at: Point, tool: Exclude<ToolId, 'hand' | 'select'>) {
		const ed = this.#editor;
		const node = bindsToNodes(tool, e) ? this.#attachAt(at) : null;
		// a pen stroke starts where the pen is, as it goes on
		const start = node?.at ?? (tool === 'pen' ? sourcePoint(...at, ed.placement) : this.snap.placeNew(at, e));
		if (tool === 'polygon' || this.preview?.chained) this.#addVertex(at, e);
		else if (this.preview?.byClicks) this.#placeNext(this.typed.committed(this.preview.points.slice(0, -1), start) ?? start);
		else if (tool === 'text') pressText(ed, e, start);
		else if (tool === 'state' || tool === 'plot') ed.addShape({ tool, at: start });
		else if (tool === 'dimension' || tool === 'trim') ed[tool].press(at);
		else if (tool === 'component' && ed.nextPartKind?.placed === 'node') ed.addShape({ tool, part: ed.nextPart, at: start });
		else {
			const free = node ? this.snap.placeNew(at, e) : undefined;
			this.#drag = { kind: 'draw', start, free, from: node ? { ref: node.ref, anchor: node.anchor } : undefined };
			this.preview = {
				tool,
				points: [start, start],
				circle: false,
				refs: [node?.ref ?? null, null],
				anchors: [node?.anchor ?? null, null],
				free,
				mode: ed.drawModeOf(tool)
			};
		}
	}

	#hover(e: PointerEvent, at: Point) {
		const ed = this.#editor;
		this.snap.guides = [];
		this.hoverInBox = ed.tool === 'select' && isInSelectionBox(ed, at);
		this.hoverNode = ed.tool === 'select' && ed.drawingMatchesText ? nodeAt(ed, at, [], NODE_HOVER_REACH_PX / ed.viewport.scale) : null;
		this.hoverPlace = ed.tool === 'select' && !this.hoverNode ? freePlaceNear(ed.diagram.places, at, ed.diagram.step / 2) : null;
		// a drawing tool shows where a press would start before the press
		// before the first click too, with its tracking lines, as CAD's
		if (!VIEW_TOOLS.has(ed.tool) && ed.tool !== 'pen' && ed.tool !== 'dimension' && ed.tool !== 'trim') this.snap.placeNew(at, e);
		else this.snap.clearMark();
		if (ed.tool === 'dimension' || ed.tool === 'trim') ed[ed.tool].move(at);
		// a line or an arrow shows the node it would start from before the press
		if (bindsToNodes(ed.tool, e)) this.#attachAt(at);
		else this.attach = null;
		if (this.preview && isStartedOver(ed, this.preview)) this.preview = null;
		if (this.preview?.chained || this.preview?.byClicks) {
			const placed = this.preview.points.slice(0, -1);
			const angled = e.shiftKey && this.preview.chained;
			const end = angled
				? onAngleStep(placed.at(-1)!, sourcePoint(...at, ed.placement), this.snap.step(e))
				: this.snap.placeNew(at, e, placed.at(-1));
			// near its first point a line shows it closing there, as a polygon does
			const closing = !!this.preview.chained && placed.length >= 3 && (this.#nearVertex(at, placed[0]) || isSamePoint(end, placed[0]));
			if (closing) this.snap.mark = { at: ed.toCanvas(...placed[0]), kind: 'endpoint' };
			this.preview = { ...this.preview, points: [...placed, closing ? placed[0] : this.typed.constrain(placed, end)] };
		}
		if (this.preview?.tool === 'polygon') {
			const first = this.preview.points[0];
			const closing = this.#nearVertex(at, first);
			if (closing) this.snap.mark = { at: ed.toCanvas(...first), kind: 'endpoint' };
			this.preview = {
				...this.preview,
				points: [...this.preview.points.slice(0, -1), closing ? first : this.snap.placeNew(at, e, this.preview.points.at(-2))]
			};
		}
	}

	#moveEdit(drag: EditDrag, e: PointerEvent, at: Point) {
		const ed = this.#editor;
		if (drag.kind === 'end' && ed.picture?.layout) {
			const placed = placedArrowEnd(ed, drag, this.#attachAt(at, [drag.i]));
			this.#drag = { ...drag, placed };
			const next = placed?.source ?? null;
			if (next !== ed.preview) ed.showPreview(next);
			return;
		}
		const binds = drag.kind !== 'end' || endBindsToNodes(ed, drag.i, e);
		const next = editDragSource(ed, this.snap, drag, e, at, (to, exclude) => {
			if (binds) return this.#attachAt(to, exclude);
			this.attach = null;
			return null;
		});
		if (next !== null && next !== (ed.preview ?? drag.base)) ed.showPreview(next);
	}

	move(e: PointerEvent, el: Element) {
		const ed = this.#editor;
		const px = this.#local(e, el);
		const at = ed.viewport.toPicture(...px);
		this.pointer = at;
		const drag = this.#drag;
		if (!drag) this.#hover(e, at);
		else if (drag.kind === 'pan') {
			ed.viewport.panBy(px[0] - drag.lastPx[0], px[1] - drag.lastPx[1]);
			this.#drag = { ...drag, lastPx: px };
		} else if (isEditDrag(drag)) {
			// a handle clicked, or barely moved, is no edit
			if (ed.preview !== null || isPastDragThreshold(this.#pressPx, px)) this.#moveEdit(drag, e, at);
		} else if (drag.kind === 'move') {
			if (!drag.moving && !isPastMoveThreshold(drag, px)) return;
			const { delta, by } = draggedSelection(ed, this.snap, drag, e, at);
			this.#drag = { ...drag, moving: true, delta };
			this.offset = { ids: drag.ids, by, until: null, copy: drag.copy };
		} else if (drag.kind === 'branch') {
			const { by, onto } = carriedBranch(ed, drag, at);
			this.offset = { ids: drag.ids, by, until: null };
			this.dropOnto = onto;
		} else if (drag.kind === 'cell') {
			const { by, to } = carriedCell(ed, drag, at);
			this.carried = { i: drag.i, to };
			this.offset = { ids: [drag.i], by, until: null };
		} else if (drag.kind === 'marquee') {
			if (!this.marquee && !isMarqueeStarted(drag, px)) return;
			this.marquee = marqueeBox(drag, at);
			ed.selectMany([...new Set([...drag.base, ...enclosedStatements(ed, this.marquee)])]);
		} else if (drag.kind === 'draw' && this.preview)
			this.preview = drawnPreview(ed, this.snap, drag, this.preview, e, at, (to, exclude) => this.#attachAt(to, exclude));
	}

	#releaseEdit(drag: EditDrag) {
		const ed = this.#editor;
		const done = ed.preview;
		ed.preview = null;
		// the arrow is numbered anew when its start moves to another cell
		if (drag.kind === 'end' && drag.placed !== undefined) {
			if (drag.placed) ed.applyPlaced(drag.placed, false);
		} else if (done !== null && done !== ed.source) ed.applyEdit(done);
	}

	up() {
		const ed = this.#editor;
		this.sizing = null;
		const marqueed = !!this.marquee;
		this.marquee = null;
		this.snap.mark = null;
		this.snap.guides = [];
		const drag = this.#drag;
		this.#drag = null;
		this.panning = false;
		this.attach = null;
		if (isEditDrag(drag)) this.#releaseEdit(drag);
		else if (drag?.kind === 'move') this.offset = releaseSelectionMove(ed, drag, this.offset);
		else if (drag?.kind === 'marquee' && !marqueed && drag.locked) {
			this.lockedShown = ancestry(ed.tree, drag.locked).at(-1) ?? drag.locked;
		} else if (drag?.kind === 'branch') {
			const onto = this.dropOnto;
			this.dropOnto = null;
			this.offset = null;
			if (onto) moveBranch(ed, drag.i, onto.stmt);
		} else if (drag?.kind === 'cell') {
			const to = this.carried?.to;
			this.carried = null;
			this.offset = to && this.offset ? landCell(ed, drag, to) : null;
		} else if (drag?.kind === 'draw' && this.preview) {
			const p = this.preview;
			this.preview = null;
			if (isSideClick(drag, p)) ed.addStep(p.refs[0]!, drag.side!);
			// a click with a line or an arrow, not a drag, draws one click by click, as Excalidraw's does
			else if (isChainStart(p)) this.preview = { ...p, points: [p.points[0], p.points[0]], chained: true, startedIn: drag.from?.ref };
			else {
				const points = goesOnByClicks(p);
				if (points) this.preview = { ...p, points, byClicks: true };
				else this.#land(p, () => addDrawnShape(ed, p));
			}
		}
	}

	cancel() {
		this.sizing = null;
		this.marquee = null;
		this.snap.mark = null;
		this.snap.guides = [];
		this.attach = null;
		this.carried = null;
		this.dropOnto = null;
		if (isEditDrag(this.#drag)) this.#editor.showPreview(null);
		this.#drag = null;
		this.panning = false;
		this.preview = null;
		this.offset = null;
	}
}
