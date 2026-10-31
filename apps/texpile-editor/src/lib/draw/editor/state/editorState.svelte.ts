import type { FigureEngine } from '../provider/figureEngine';
import type { FigureLanguage, NewPictureKind, NewShape, NodeSide, PlacedEdit, ShapeStyle } from '../figure/figureLanguage';
import { canvasPoint, IDENTITY, sourcePoint } from '../figure/geometry';
import { snapTo } from '../figure/numbers';
import { StatementFlags } from '../objects/statementFlags.svelte';
import { DiagramCells } from '../diagrams/diagramCells.svelte';
import { buildTree, followStatement, subtree } from '../objects/statementTree';
import { TrimEdit } from './trim/trimEdit.svelte';
import { DimensionEdit } from './dimension/dimensionEdit.svelte';
import { EditCheck } from './render/editCheck.svelte';
import { familyOf, type DrawMode, type DrawModes } from './drawModes/drawModes';
import { readDrawModes, writeDrawModes } from './drawModes/storedDrawModes';
import { boundsOf } from '../canvas/partBounds';
import { createCodeDocument, type CodeChange } from './codeDocument';
import { readGridShown, writeGridShown } from './gridShown';
import { PaneLayout } from './paneLayout.svelte';
import { RenderLoop } from './render/renderLoop.svelte';
import { selectionHandles } from './selection/selectionHandles';
import { naturalFrame, sheetHandlesOf, sheetOf } from './sheetFrame';
import { editorSnapBoxes, unionBox } from './snapTargets';
import { editorSnapScene } from './snap/snapScene';
import { PX_PER_BP, Viewport } from './viewport.svelte';
import { inNextStyle } from './selection/selectionStyle';
import { TextSelections } from './selection/textSelections';
import type { HostHistory, ToolId } from './editorState.types';

const NUDGE_JOIN_MS = 500;

export class FigureEditorState {
	readonly language!: FigureLanguage;
	/** the code's own text */
	text = $state('');
	#commandAsPicture = $derived(this.language.withCommandAsPicture(this.text));
	/** what the canvas draws and edits: the code's text, its picture written as an environment when it has none, written on the first edit */
	source = $derived(this.language.withPicture(this.#commandAsPicture));
	/** the code has no picture yet: the canvas shows a new one */
	pictureIsNew = $derived(this.source !== this.#commandAsPicture);
	/** the code begins a picture it never ends, which is not a picture yet either */
	unclosed = $derived(this.pictureIsNew ? this.language.unclosedPicture(this.text) : null);
	/** the code's picture is a `\tikz` command: the canvas shows it as an environment */
	pictureIsCommand = $derived(this.#commandAsPicture !== this.text);
	pictures = $derived(this.language.listPictures(this.source));
	/** the picture of the text the editor shows: the first, unless the host opened another or follows one */
	shownIndex = $state(0);
	picture = $derived(this.language.readPicture(this.source, this.shownIndex));
	/** the frame as the canvas shows it, so a corner drag's preview resizes the sheet before it is written */
	frame = $derived.by(() => {
		const text = this.preview ?? this.source;
		const picture = this.preview === null ? this.picture : this.language.readPicture(text, this.shownIndex);
		return picture ? this.language.readFrame(text, picture) : null;
	});
	#tool = $state<ToolId>('select');
	get tool() {
		return this.#tool;
	}
	/** a drawing tool lets go of the selection, as Excalidraw's do, so the inspector shows the next shape's style */
	set tool(tool: ToolId) {
		this.#tool = tool;
		this.dimension.reset();
		if (tool !== 'select' && tool !== 'hand' && this.selection.length) this.select(0);
	}
	/** the editor's own guide on the sheet, never written: off, so the sheet shows only what TikZ draws */
	gridShown = $state(readGridShown());
	shortcutsShown = $state(false);
	libraryShown = $state(false);
	/** the user has started on the canvas, by a choice of the starting pictures or by drawing */
	startersDismissed = $state(false);
	#applying = false;
	/** where the right-click menu opened, in page px; null while it is closed */
	contextMenuAt = $state.raw<{ x: number; y: number } | null>(null);
	/** the drawing tool stays picked after a shape, rather than going back to Select */
	toolLocked = $state(false);
	/** how each kind of shape is drawn, picked from its tool's menu */
	drawModes = $state<DrawModes>(readDrawModes());
	/** the style the next shape is drawn in: the last one picked */
	nextStyle = $state<Partial<ShapeStyle>>({});
	/** the circuit part the component tool adds: the last one picked */
	nextPart = $state('R');
	nextPartKind = $derived(this.language.circuitParts.find((p) => p.id === this.nextPart) ?? null);
	#selections = new TextSelections();
	#lastNudge = 0;
	/** the statement the inspector and the handles are for; 0 for none */
	selected = $state(0);
	/** every selected statement, the one above among them */
	selection = $state<number[]>([]);
	/** the drawing on screen numbers its statements as the text does: a click on it picks the statement it shows */
	drawingMatchesText = $derived.by(() => {
		const drawn = this.render.drawnStatements;
		const now = this.picture?.statements ?? [];
		return this.render.drawnIndex === this.shownIndex && drawn.length === now.length && drawn.every((s, k) => s.kind === now[k].kind);
	});
	tree = $derived(buildTree(this.picture?.statements ?? []));
	readonly flags = new StatementFlags(() => this.tree);
	readonly diagram = new DiagramCells(this);
	readonly dimension = new DimensionEdit(this);
	readonly trim = new TrimEdit(this);
	readonly check = new EditCheck();
	/** the statement the pointer is over in the objects list, outlined on the canvas */
	hovered = $state(0);
	selectedStatement = $derived(this.picture?.statements.find((s) => s.i === this.selected) ?? null);
	selectedStatements = $derived(this.picture?.statements.filter((s) => this.selection.includes(s.i)) ?? []);
	selectedInfo = $derived(this.selectedStatement ? this.language.describe(this.source, this.selectedStatement) : null);
	readonly panes = new PaneLayout();
	/** the selected statement's text is being typed on the canvas */
	editingText = $state(false);
	/** a point drag shows its result before it is written: the engine draws this text, the code keeps the last written one */
	preview = $state<string | null>(null);

	/** every path's and node's points on the canvas, for snapping to */
	snapScene = $derived.by(() => editorSnapScene(this, this.#shownParts));
	snapBoxes = $derived.by(() => editorSnapBoxes(this, this.#shownParts));
	#shownParts = $derived.by(() => (this.render.drawing?.parts ?? []).filter((p) => !this.flags.hiddenAll.has(p.stmt)));

	/** the selected connector as written, in the text the canvas shows */
	selectedConnector = $derived.by(() => {
		const st = this.selectedStatement;
		if (!st || st.kind !== 'path' || this.selection.length > 1) return null;
		const text = this.preview ?? this.source;
		const own = this.preview === null ? st : this.language.readPicture(text, this.shownIndex)?.statements.find((s) => s.i === st.i);
		const connector = own && this.language.readConnector(text, own);
		return connector ? { st: own, connector, text } : null;
	});

	handles = $derived(selectionHandles(this));
	/** handles that size the framed sheet while nothing is selected */
	sheetHandles = $derived.by(() =>
		this.sheet?.framed && !this.selection.length && this.tool === 'select' ? sheetHandlesOf(this.sheet) : []
	);

	/** where a statement added last lands: the coordinates new shapes, the grid and the pointer are in */
	placement = $derived.by(() => this.render.transformOf((this.picture?.statements.length ?? 0) + 1));

	readonly render: RenderLoop;
	readonly viewport = new Viewport();
	readonly code;
	#onchange?: (source: string) => void;
	#history?: HostHistory;

	/** the sheet: the frame when the picture has one, else the box the engine made, in bp */
	sheet = $derived.by(() =>
		sheetOf(this.frame, this.frame ? this.render.transformOf(this.frame.i) : IDENTITY, this.render.drawing?.bbox ?? null)
	);

	constructor(
		engine: FigureEngine,
		language: FigureLanguage,
		initial: string,
		onchange?: (source: string) => void,
		history?: HostHistory,
		shownIndex = 0
	) {
		this.language = language;
		this.shownIndex = shownIndex;
		const text = language.upToDate(initial);
		this.text = text;
		this.#onchange = onchange;
		this.#history = history;
		this.viewport.limitTo(() => this.viewRect);
		this.render = new RenderLoop(
			engine,
			language,
			() => this.shownIndex,
			(source) => {
				this.#takeBackBroken(source, this.render.errors, null);
				this.diagram.drawn();
				// a drawing a newer request has already overtaken is not the one to fit
				const latest = this.render.drawnRequest === this.render.requested;
				if (!this.viewport.fitted && latest && this.render.drawnIndex === this.shownIndex) this.fitView();
			},
			(source, failure) => this.#takeBackBroken(source, null, failure)
		);
		this.code = createCodeDocument(
			text,
			(c) => this.#codeChanged(c),
			language.codeLanguage,
			history,
			(source) => language.foldRanges(source)
		);
		this.render.request(this.source);
	}

	#codeChanged({ source: text, docChanged, cursor, mapPos, replaced }: CodeChange) {
		if (docChanged) {
			const before = this.picture?.statements ?? [];
			const was = this.source;
			// a paste over the whole figure is another figure, so the view fits it as it does an opened file
			const figure = this.language.listPictures(this.text)[0] ?? { from: 0, to: this.text.length };
			if (replaced(figure.from, figure.to)) this.viewport.fitted = false;
			this.text = text;
			const source = this.source;
			// the host hears it first: an engine may read the document's preamble from the host
			this.#onchange?.(text);
			this.render.request(source);
			// code cleared down to an empty picture offers the starting pictures again
			if (!this.#applying && !this.picture?.statements.some((s) => s.kind !== 'frame')) this.startersDismissed = false;
			if (!this.#applying) this.check.letGo();
			// undo and the document's own changes renumber statements: the selection and the flags stay on their
			// statements, found by their text nearest where they were (a change is its smallest diff, which can start
			// inside a neighbor), else by where they start
			const after = this.picture?.statements ?? [];
			function follow(ids: number[]) {
				return ids.flatMap((i) => {
					const st = before.find((s) => s.i === i);
					const found = st && followStatement(after, source, was.slice(st.from, st.to), mapPos(st.from));
					return found ? [found.i] : [];
				});
			}
			this.flags.carry(follow);
			// undo and redo bring back the selection the text had
			const had = cursor === null ? this.#selections.of(text) : null;
			const kept = had?.ids.filter((i) => after.some((s) => s.i === i));
			if (had && kept) this.selectMany(kept, had.primary);
			else if (cursor === null && this.selection.length) this.selectMany(follow(this.selection), follow([this.selected])[0]);
		}
		if (cursor !== null && this.picture) {
			const st = this.language.statementAt(this.picture, cursor);
			this.select(st && st.kind !== 'frame' ? st.i : 0);
		}
	}

	/** replaces the whole text, as opening another file does; history starts over with it */
	load(source: string) {
		this.code.reset(this.language.upToDate(source));
		this.startersDismissed = false;
		this.preview = null;
		this.tool = 'select';
		this.select(0);
		this.flags.clear();
		this.viewport.fitted = false;
	}

	select(i: number) {
		this.selectMany(i ? [i] : []);
	}

	/** the code shows the one the inspector is for */
	selectMany(ids: number[], primary = ids.at(-1) ?? 0) {
		const i = ids.includes(primary) ? primary : (ids.at(-1) ?? 0);
		if (i !== this.selected) this.editingText = false;
		this.selected = i;
		this.selection = ids;
		const ranges = (this.picture?.statements ?? []).filter((s) => ids.includes(s.i)).map((s) => ({ from: s.from, to: s.to }));
		const st = this.picture?.statements.find((s) => s.i === i);
		// the code view may be mid-update when the cursor picked the statement
		queueMicrotask(() => this.code.showStatements(ranges, st ? { from: st.from, to: st.to } : null));
	}

	/** in or out of the selection, as Shift and a click do */
	toggleSelected(i: number) {
		if (this.selection.includes(i)) this.selectMany(this.selection.filter((s) => s !== i));
		else this.selectMany([...this.selection, i]);
	}

	selectAll() {
		const { hiddenAll, lockedAll } = this.flags;
		const top = this.tree.children.get(0) ?? [];
		this.selectMany(top.filter((i) => this.tree.byId.get(i)?.kind !== 'frame' && !hiddenAll.has(i) && !lockedAll.has(i)));
	}

	showPreview(text: string | null) {
		this.preview = text;
		this.render.request(text ?? this.source);
	}

	/** an edit that may leave the text as it was, which then adds no undo step */
	applyIfChanged(next: string | null) {
		if (next !== null && next !== this.source) this.applyEdit(next);
	}

	/** every canvas and inspector edit lands here, as one undo step */
	applyEdit(next: string, select: number | number[] = this.selection, step: 'own' | 'first' | 'joined' = 'own') {
		const primary = this.selected;
		this.#lastNudge = step === 'own' ? 0 : this.#lastNudge;
		this.addedText = 0;
		this.startersDismissed = true;
		this.#selections.remember(this.text, this.selection, primary);
		this.#applying = true;
		this.code.replace(next, step);
		this.#applying = false;
		this.check.edited(this.source, step !== 'joined');
		if (typeof select === 'number') this.select(select);
		else this.selectMany(select, primary);
		this.#selections.remember(this.text, this.selection, this.selected);
	}

	/** the mode a tool draws in, for a tool with modes */
	drawModeOf(tool: ToolId) {
		const family = familyOf(tool);
		return family ? this.drawModes[family] : undefined;
	}

	/** a mode picked from a tool's menu, which takes that tool up */
	pickDrawMode(tool: ToolId, mode: DrawMode) {
		const family = familyOf(tool);
		if (!family) return;
		this.drawModes = { ...this.drawModes, [family]: mode };
		writeDrawModes(this.drawModes);
		this.tool = tool;
	}

	pickNextStyle(change: Partial<ShapeStyle>) {
		this.nextStyle = { ...this.nextStyle, ...change };
	}

	showLibrary(shown: boolean) {
		this.libraryShown = shown;
	}

	pickNextPart(id: string) {
		this.nextPart = id;
	}

	/** the text node just added, which leaving empty takes back */
	addedText = 0;

	/** arrow-key steps close together are one undo step, as Excalidraw's are */
	applyNudge(next: string | null) {
		if (next === null || next === this.source) return;
		const now = performance.now();
		const joined = now - this.#lastNudge < NUDGE_JOIN_MS;
		this.applyEdit(next, this.selection, joined ? 'joined' : 'first');
		this.#lastNudge = now;
	}

	/** the next step of a flowchart from a node's side, its text ready to type */
	addStep(from: number, side: NodeSide, typeText = true) {
		const added = this.language.addStep(this.source, this.shownIndex, from, side, 'Step');
		if (added) this.applyPlaced(added, typeText);
	}

	/** a statement's text typed into, the selected one's unless another is given, from whatever tool */
	editText(i = this.selected) {
		if (i !== this.selected) this.select(i);
		if (this.tool !== 'select') this.tool = 'select';
		this.editingText = true;
	}

	/** an edit that placed a statement starting at `at`, which is selected, its text ready to type into when asked */
	applyPlaced({ source, at }: PlacedEdit, typeText: boolean) {
		const st = this.language.readPicture(source, this.shownIndex)?.statements.find((s) => s.from === at);
		this.applyEdit(source, st?.i ?? 0);
		if (typeText) this.editingText = true;
	}

	/** the sheet, and around a diagram the free places a click adds a cell in, or the room a tree grows into */
	get viewRect() {
		const s = this.sheet?.w && this.sheet.h ? this.sheet : this.#inkRect();
		const layout = this.picture?.layout;
		const pad = layout === 'grid' ? this.diagram.step * 1.5 : layout ? 36 : 0;
		return s ? { x: s.x - pad, y: s.y - pad, w: s.w + 2 * pad, h: s.h + 2 * pad } : null;
	}

	// pgf leaves what is drawn under a low-level transform out of the picture's box, so a box can be empty with ink in it
	#inkRect() {
		const b =
			this.render.drawing && boundsOf(this.render.drawing.parts, (f) => this.render.fonts.get(f)?.size ?? 10, this.render.drawing.clips);
		return b ? { x: b.x1, y: b.y1, w: b.x2 - b.x1, h: b.y2 - b.y1 } : null;
	}

	toggleGrid() {
		this.gridShown = !this.gridShown;
		writeGridShown(this.gridShown);
	}

	fitView() {
		const rect = this.viewRect;
		// a diagram or a tree grows, so it starts at about twice its printed size
		if (rect) this.viewport.fit(rect, this.picture?.layout ? 3 : undefined);
	}

	/** the selection fills the view, at no more than four times its printed size; with nothing selected the sheet */
	fitSelection() {
		const inside = new Set(this.selection.flatMap((i) => subtree(this.tree, i)));
		const b = unionBox(this.snapBoxes.filter((s) => inside.has(s.stmt)));
		if (b) this.viewport.fit({ x: b.x1, y: b.y1, w: b.x2 - b.x1, h: b.y2 - b.y1 }, 4 * PX_PER_BP);
		else this.fitView();
	}

	/** a canvas point in bp, as a point in the picture's own coordinates, snapped */
	toSource(x: number, y: number, step: number): [number, number] {
		const [u, v] = sourcePoint(x, y, this.placement);
		return [snapTo(u, step), snapTo(v, step)];
	}

	toCanvas(u: number, v: number): [number, number] {
		return canvasPoint(u, v, this.placement);
	}

	/** a fresh picture of the kind in place of the one there, as one edit that undo takes back */
	newPicture(kind: NewPictureKind) {
		this.applyEdit(this.language.replacePicture(this.source, kind), 0);
		this.flags.clear();
		this.viewport.fitted = false;
	}

	/** a new statement, last in the picture; lines and arrows drawn on a node refer to it by name */
	addShape(shape: NewShape) {
		const added = this.language.addShape(this.source, this.shownIndex, shape);
		if (!added || !this.picture) return;
		const i = this.picture.statements.length + 1;
		this.applyEdit(inNextStyle(this, added, i, shape.tool), i);
		this.addedText = shape.tool === 'text' ? i : 0;
		// the pen draws on, as Excalidraw's does
		if (!this.toolLocked && shape.tool !== 'pen') this.tool = 'select';
		if (shape.tool === 'text' || shape.tool === 'box' || shape.tool === 'state') this.editingText = true;
	}

	setNodeText(text: string) {
		const st = this.selectedStatement;
		const next = st && this.language.writeText(this.source, st, text);
		this.preview = null;
		if (next) this.applyEdit(next);
	}

	/** the selected node drawn with text not written yet, as it is typed; text the language would refuse keeps the last */
	previewNodeText(text: string | null) {
		const st = this.selectedStatement;
		const next = st && text !== null && !this.language.textProblem(text) ? this.language.writeText(this.source, st, text) : null;
		if (text === null || !st) this.showPreview(null);
		else if (next) this.showPreview(next);
	}

	/** drawn again from scratch, and the view fitted to it, for when the canvas looks behind the text */
	redraw() {
		this.render.restart(this.source);
		this.viewport.fitted = false;
	}

	/** the picture's own size again, the box of what it draws: its frame statement goes */
	clearFrame() {
		const frame = this.picture?.statements.find((s) => s.kind === 'frame');
		if (frame) this.applyEdit(this.language.removeStatement(this.source, frame), []);
	}

	/** fixes the picture's size: the natural box rounded out to the grid, or the size given */
	setFrame(size?: { w: number; h: number }) {
		if (!this.picture) return;
		if (size && this.frame) {
			this.applyEdit(
				this.language.writeFrame(this.source, this.picture, {
					x1: this.frame.x1,
					y1: this.frame.y1,
					x2: this.frame.x1 + size.w,
					y2: this.frame.y1 + size.h
				})
			);
			return;
		}
		const b = this.render.drawing?.bbox;
		if (b) this.applyEdit(this.language.writeFrame(this.source, this.picture, naturalFrame(b, this.render.transformOf(0))));
	}

	#takeBackBroken(source: string, errors: readonly string[] | null, failure: string | null) {
		const steps = this.check.drawn(source, this.source, errors, failure);
		for (let k = 0; k < steps; k++) this.undo();
	}

	/** the text changed outside the editor (another editor of the file, the document's undo): take it, keeping the view
	 *  and the selection, out of the figure's own history */
	sync(text: string) {
		if (text !== this.text) this.code.replace(text, 'outside');
	}

	undo() {
		if (this.#history) this.#history.undo();
		else this.code.undo();
	}

	redo() {
		if (this.#history) this.#history.redo();
		else this.code.redo();
	}

	destroy() {
		this.code.destroy();
	}
}
