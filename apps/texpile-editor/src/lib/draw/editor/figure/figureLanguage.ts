import type { Extension } from '@codemirror/state';
import type { Drawing } from '../drawing/drawing.types';
import type { LoadedFont } from '../drawing/fontOutlines';
import type { FigureEngine } from '../provider/figureEngine';
import type { Box, Point, SourceTransform } from './geometry';

/** a range of the source text */
export type TextSpan = { from: number; to: number };
/** the sides of a node a connector or the next step leaves by, as TikZ names its anchors */
export type NodeSide = 'north' | 'east' | 'south' | 'west';
/** an edit that placed a statement, and where that statement starts in the text */
export type PlacedEdit = { source: string; at: number };

/** `axis` is pgfplots' environment, and `plot` an `\\addplot` in it; `cell` and `arrow` are a tikz-cd diagram's, `branch` a forest tree's */
export type StatementKind = 'path' | 'node' | 'scope' | 'foreach' | 'frame' | 'axis' | 'plot' | 'cell' | 'arrow' | 'branch' | 'other';

export type FigureStatement = {
	/** 1-based, the number the engine marks this statement's drawing with */
	i: number;
	from: number;
	to: number;
	kind: StatementKind;
};

export type FigurePicture<S extends FigureStatement = FigureStatement> = {
	from: number;
	to: number;
	statements: S[];
	/** a picture TeX lays out itself, a diagram's grid or a tree, where the drawing tools stand aside */
	layout?: 'grid' | 'tree';
	/** a circuit: ends that meet stay joined when one of them moves */
	circuit?: boolean;
};

export type PointSpan = {
	from: number;
	to: number;
	/** where the point lands, in source units */
	x: number;
	y: number;
	/** written as an angle and a radius */
	polar?: boolean;
	/** each length written in cm, which pgfplots needs where a bare number is in its axis units */
	cm?: boolean;
	/** '' for a point of its own, '+' or '++' for one written from the current point */
	relative?: '' | '+' | '++';
	/** the current point a relative point is written from */
	base?: [number, number];
	/** the relative points written from this one, which keep their places when it moves */
	followers?: number[];
	/** how the point before it reaches it: a straight line, or as the other corner of a rectangle */
	joined?: 'line' | 'rectangle';
	/** the path goes straight from it back to this point, its `-- cycle` */
	closedTo?: number;
	/** not a point the path goes through: a curve's control point, or a node's place along it */
	aside?: boolean;
};

/** `centerPoint`: the center's place among the statement's `pathPoints`, where it is one of them */
export type RadiusSpan = {
	from: number;
	to: number;
	value: number;
	axis: 'r' | 'x' | 'y';
	center: { x: number; y: number };
	centerPoint?: number;
};
/** an arc's radius, and the angles it runs between, in degrees */
export type ArcSpan = RadiusSpan & { start: number; end: number };

/** what a statement paints unless told otherwise: the inspector offers stroke, fill or both from it */
export type StyleTarget = 'draw' | 'fill' | 'filldraw' | 'path' | 'node';

/** the style as the language writes it: color names and choices from its own lists */
export type ShapeStyle = {
	stroke: string | null;
	fill: string | null;
	width: string | null;
	dash: string | null;
	arrows: string | null;
	/** a node's text; null where it has none of its own */
	textColor: string | null;
	textSize: string | null;
	/** percent, or `custom` */
	opacity: string | null;
	corners: 'sharp' | 'rounded' | null;
};

/** the inspector's style fields, each one a statement draws with */
export type StyleFieldSet = Record<'stroke' | 'fill' | 'width' | 'dash' | 'arrows' | 'text' | 'corners' | 'opacity', boolean>;

export type StatementInfo = {
	/** what it is, by an id the editor keys its icons and counts by; a command it does not know is its own */
	kind: string;
	title: string;
	/** the canvas can move it: it is a path or node with points of its own */
	movable: boolean;
	target: StyleTarget | null;
	/** the style fields it takes, each one that changes how it is drawn */
	fields: StyleFieldSet;
	/** a node's text, which the inspector edits in place */
	text: TextSpan | null;
	/** what the objects list calls it without text of its own: a diagram's arrow by the cells it joins */
	name: string | null;
};

/** where a drawn path starts or ends: a point, or the node statement it was drawn from or to, at one of its anchors or its border */
export type Endpoint = Point | { ref: number; at: Point; anchor?: string | null };

/** how a connector gets from one end to the other: straight, across then up (`-|`), up then across, bent, or a curve */
export type ConnectorRoute =
	| 'straight'
	| 'hv'
	| 'vh'
	| 'bend left'
	| 'bend right'
	| 'curve'
	/** from a node back to itself, as a state machine's arrows that stay */
	| 'loop above'
	| 'loop below'
	| 'loop left'
	| 'loop right';
export type ConnectorLabel = {
	text: string;
	pos: 'at start' | 'near start' | 'midway' | 'near end' | 'at end';
	side: 'above' | 'below' | 'left' | 'right' | null;
};
/** a path from one end to the other, each a node by name (at an anchor, or its border) or a point */
export type Connector = {
	ends: [{ node: string | null; anchor: string | null }, { node: string | null; anchor: string | null }];
	route: ConnectorRoute;
	/** how far a bent route leaves its line, in degrees */
	bend: number | null;
	label: ConnectorLabel | null;
};

export type NewShape =
	/** `via`: the corners of a line drawn click by click */
	| { tool: 'line' | 'arrow' | 'curve'; from: Endpoint; to: Endpoint; route?: ConnectorRoute; via?: Point[] }
	| { tool: 'rect'; from: Point; to: Point }
	/** a node with an outline, sized to the drag, which text goes in and connectors meet */
	| { tool: 'box'; from: Point; to: Point; shape?: NodeShape; angle?: number }
	/** a pgfplots axis with a function in it, its lower left corner at `at` */
	| { tool: 'plot'; at: Point }
	/** a state machine's state, named q0, q1 ... */
	| { tool: 'state'; at: Point }
	/** a circuit's part: drawn from one end to the other, or placed as a node at a point */
	| { tool: 'component'; part: string; from: Endpoint; to: Endpoint }
	| { tool: 'component'; part: string; at: Point }
	| { tool: 'ellipse'; from: Point; to: Point; circle: boolean }
	| { tool: 'pen'; points: Point[] }
	| { tool: 'polygon'; points: Point[] }
	/** from is where the axes cross, to is how far they reach */
	| { tool: 'axes'; from: Point; to: Point }
	| { tool: 'text'; at: Point; text: string };

/** a rearranged text, and where each statement the edit placed starts in it */
export type Arranged = { source: string; at: number[] };
/** beside another statement, or last inside a scope */
export type ArrangeTarget = { before: number } | { after: number } | { into: number };

/** the outline a node draws around its text; a flowchart's outlines among them: a terminal's pill, a slanted input or output, a cylinder for stored data */
export type NodeShape = 'rectangle' | 'rounded' | 'terminal' | 'circle' | 'ellipse' | 'diamond' | 'slant' | 'cylinder';
/** a node's outline and the least size it keeps, in the picture's units; null sizes follow its text */
export type NodeBox = {
	/** null for an outline that is none of these, such as a library cloud */
	shape: NodeShape | null;
	w: number | null;
	h: number | null;
	/** a state machine's state: where the machine starts, and where it may stop */
	state: { initial: boolean; accepting: boolean } | null;
};
/** the positioning library's sides, as a node placed beside another is written: `below right=of a` */
export type PlaceDirection = 'above' | 'below' | 'left' | 'right' | 'above left' | 'above right' | 'below left' | 'below right';
/** a node placed beside another one, `distance` as written ('' takes the picture's node distance) */
export type NodePlacement = { direction: PlaceDirection; distance: string; of: string };
/** what the inspector changes on a node: its outline and size, or a state's start and accepting marks */
export type NodeBoxChange = Partial<Pick<NodeBox, 'shape' | 'w' | 'h'>> & { initial?: boolean; accepting?: boolean };

/** a pgfplots axis as the inspector shows it; null where the axis decides for itself */
export type PlotAxis = {
	title: string | null;
	xlabel: string | null;
	ylabel: string | null;
	x: [number | null, number | null];
	y: [number | null, number | null];
	/** in cm */
	width: number | null;
	height: number | null;
	grid: 'none' | 'major' | 'both';
	lines: 'box' | 'left' | 'middle';
};
/** one `\\addplot`: a function of x when it has an expression, else its data */
export type PlotSeries = {
	expression: string | null;
	domain: [number | null, number | null];
	color: string | null;
	mark: 'none' | '*' | 'o' | 'square*';
	line: 'solid' | 'dashed' | 'only marks';
};

/** a commutative diagram's arrow as the inspector shows it; the label's side is as seen along the arrow */
export type DiagramArrow = {
	label: string;
	side: 'left' | 'right' | 'on';
	head: 'to' | 'hook' | 'two heads' | 'mapsto' | 'dash' | 'Rightarrow' | 'equal';
	line: 'solid' | 'dashed' | 'dotted';
	bend: 'none' | 'left' | 'right';
};
/** a commutative diagram's cells by row and column, 1-based; `cell` is the statement showing there */
export type DiagramGrid = { rows: number; cols: number; cells: { r: number; c: number; cell: number }[] };
/** where TeX put a cell of the grid, in bp */
export type DiagramSlot = { r: number; c: number; at: Point };

/** an element the library adds: its statements, written around the origin, and what its preamble needs */
export type LibraryElement = NewPictureKind & { group: string };

/** a statement's point, by its place among its `pathPoints` */
export type PointRef = { stmt: number; k: number };
/** a name a statement that goes gives, as another statement takes a point from it: at one of its anchors, or none */
export type LetGoReference = { stmt: number; name: string; anchor: string | null };
/** the arcs of an ellipse drawn, each from its start to its end angle, in degrees, the end the greater */
export type ArcSpans = [number, number][];
/** lines through points, from one to the next, and back to the first when closed */
export type TrimRun = { points: Point[]; closed: boolean };
/** a shape the Trim tool cuts, in the statement's own coordinates as written: runs of lines, or an ellipse square to
 *  them, whole or its arcs; a node's outline is the one TeX drew, round or of straight sides */
export type TrimmableShape =
	| { kind: 'polyline'; runs: TrimRun[] }
	| { kind: 'ellipse'; center: Point; rx: number; ry: number; spans?: ArcSpans }
	| { kind: 'node'; round: boolean };
/** what is left of a shape once a piece is cut away: runs of lines, or arcs of one ellipse */
export type TrimmedShape = { kind: 'polyline'; runs: TrimRun[] } | { kind: 'arcs'; center: Point; rx: number; ry: number; spans: ArcSpans };

/** a dimension written into the figure, which TeX draws and measures itself; offsets and radii in cm on the paper */
export type FigureDimension =
	/** between two points: along the line from one to the other, or across (`x`) or up (`y`) */
	(
		| { kind: 'aligned' | 'x' | 'y'; from: PointRef; to: PointRef; offset: number }
		/** a node's outline across or up, `side` 1 above or right of it, -1 below or left */
		| { kind: 'node'; stmt: number; axis: 'x' | 'y'; side: 1 | -1; offset: number }
		/** between two segments, each the way from its first point to its second, or back (`rays`) */
		| { kind: 'angle'; lines: [[PointRef, PointRef], [PointRef, PointRef]]; rays: [1 | -1, 1 | -1]; radius: number }
		/** a circle's radius, `value` as it reads, out from its center at `angle` degrees */
		| { kind: 'radius'; center: PointRef; length: number; value: number; angle: number }
	) & {
		/** printed instead of what it measures, as a figure names a side `a` */
		label?: string;
	};

/** a part the component tool adds: drawn along a path between two ends, or placed as a node with `pins` to wire to */
export type CircuitPartKind = { id: string; name: string; placed: 'path' | 'node'; pins: readonly string[]; icon: string };
/** one part of a circuit statement as the inspector shows it; a node's label is its text, so it has none here */
export type CircuitPart = {
	type: string;
	placed: 'path' | 'node';
	label: string | null;
	voltage: string | null;
	current: string | null;
};
/** where TeX put a pin of a circuit node, in bp */
export type CircuitPin = { i: number; anchor: string; at: Point };

/** a picture a file can start from: its text, and the package and TikZ libraries its preamble needs */
/** `thumb`: the picture as an image, for the starters and the library to show; the empty picture has none */
export type NewPictureKind = { id: string; name: string; text: string; usepackage: string | null; libraries: string[]; thumb?: string };

export type FigureFrame = Box;

export type RenderedFigure = {
	drawing: Drawing;
	/** the fonts glyph parts are drawn with, by font id */
	fonts: Map<number, LoadedFont>;
	outline: (font: LoadedFont, code: number, gi?: number) => string | null;
	/** each statement's transform, by statement number, with its own options' (scale, rotate); 0 is the picture's own */
	transforms: Map<number, SourceTransform>;
	/** each statement's transform where it starts, before its own options, which a turn about a point is written in */
	outerTransforms: Map<number, SourceTransform>;
	errors: string[];
	/** the line of the source each error was found on, when TeX said */
	errorLines: (number | null)[];
	/** statements left out because they cost the engine the whole picture */
	failed: number[];
	/** a diagram's grid cells as TeX placed them; none for a picture */
	slots: DiagramSlot[];
	/** the pins of a circuit's named nodes */
	pins: CircuitPin[];
	ms: number;
};

/** the swatches the inspector offers, in the language's own color names */
export type FigureColors = {
	swatches: [name: string, hex: string][];
	/** lighter steps of a swatch, strongest first */
	shades: readonly string[];
	split(color: string | null): { base: string | null; shade: string };
	join(base: string, shade: string): string;
	swatchFill(hex: string, shade: string): string;
};

/** text the code pane can collapse: what is hidden, the label shown in its place, and whether it starts collapsed (what
 *  the editor writes for itself, and what is rarely read) */
export type CodeFold = { from: number; to: number; label: string | null; collapsed: boolean };

/** a tool or a panel the editor offers only for a language that backs it */
export type FigureFeature = 'library' | 'dimensions' | 'trim' | 'states' | 'plots' | 'circuits';

/** a figure language (TikZ): how its pictures read, render and are edited as text */
export type FigureLanguage = {
	id: string;
	name: string;
	features: readonly FigureFeature[];
	/** what draws it, as the editor names it in its notices: TeX */
	engineName: string;
	/** where the Help menu sends someone for the language itself */
	manual: { label: string; url: string };
	/** a fresh picture with a canvas size set */
	newPicture: string;
	/** the code pane's support for the language: its highlighting */
	codeLanguage: Extension[];
	/** every region of the text the code pane can collapse */
	foldRanges(source: string): CodeFold[];
	listPictures(source: string): { from: number; to: number }[];
	/** a picture begun and never ended: how it opens and what would close it, and the line it begins on */
	unclosedPicture(source: string): { open: string; close: string; line: number } | null;
	/** the text with its first `\\tikz{...}` command written as an environment, when it has no environment */
	withCommandAsPicture(source: string): string;
	/** the text with a new picture where one goes, when it has none */
	withPicture(source: string): string;
	/** a picture of `kind` in place of the first, with the package it needs */
	replacePicture(source: string, kind: NewPictureKind): string;
	/** why a node's text cannot be written as it is, or null */
	textProblem(text: string): string | null;
	readPicture(source: string, index: number): FigurePicture | null;
	statementAt(picture: FigurePicture, pos: number): FigureStatement | null;
	describe(source: string, st: FigureStatement): StatementInfo;
	render(engine: FigureEngine, source: string, picture: FigurePicture): Promise<RenderedFigure>;

	pathPoints(source: string, st: FigureStatement): PointSpan[];
	radii(source: string, st: FigureStatement): RadiusSpan[];
	/** the arcs drawn from a point of the statement's own, each around its center */
	arcs(source: string, st: FigureStatement): ArcSpan[];
	/** one point moved to `to`; the points written from it stay where they are */
	movePoint(source: string, points: PointSpan[], k: number, to: Point): string;
	/** moved by (du, dv) in the coordinates it starts in (before its own options), which is `page` cm on the page, where a node's own shifts and distances
	 *  are counted whatever the picture's scale; without `page`, the two are taken to be the same */
	shiftStatement(source: string, st: FigureStatement, du: number, dv: number, page?: [number, number]): string;
	/** every point scaled away from `anchor`, radii with them; a circle takes sx for its radius */
	stretchStatement(source: string, st: FigureStatement, anchor: Point, sx: number, sy: number): string;
	/** how far it is turned, in degrees; null for what does not turn */
	readRotation(source: string, st: FigureStatement): number | null;
	/** turned about `center`, in the coordinates the statement starts in (before its own options) */
	rotateStatement(source: string, st: FigureStatement, center: Point, degrees: number): string | null;
	/** a copy right after the original, offset by the given step */
	duplicateStatement(source: string, st: FigureStatement, du: number, dv: number, page?: [number, number]): string;
	removeStatement(source: string, st: FigureStatement): string;
	/** what the statements `gone` name let go of: each point the others take from them written where `pointOf` says,
	 *  in the coordinates of the statement taking it, and a node placed beside one put where `placeOf` says it is */
	letGoOf(
		source: string,
		pictureIndex: number,
		gone: number[],
		pointOf: (st: FigureStatement, ref: LetGoReference) => Point | null,
		placeOf: (st: FigureStatement) => Point | null
	): string;
	/** what an edit from `before` to `after` takes from a statement that needs it, said plainly, or null: a node, a style
	 *  or a macro it uses moved after it, into a group it is not in, or gone */
	brokenNeed(before: string, after: string, pictureIndex: number): string | null;
	/** pasted statements go last in the picture; a whole picture pastes its body */
	appendStatements(source: string, pictureIndex: number, text: string): string | null;
	/** taken out and put back beside another statement or last in a scope, in the order they are written */
	moveStatements(source: string, picture: FigurePicture, ids: number[], to: ArrangeTarget): Arranged | null;
	/** wrapped in a scope where the last of them was; null unless they share a parent */
	groupStatements(source: string, picture: FigurePicture, ids: number[]): Arranged | null;
	/** null when the scope's own options would stop applying */
	ungroupStatement(source: string, picture: FigurePicture, id: number): Arranged | null;
	/** a name the user gave the statement, kept beside it in the text */
	readLabel(source: string, st: FigureStatement): string | null;
	writeLabel(source: string, st: FigureStatement, label: string): string;
	/** a node statement's name, which connectors point at it by */
	nameOf(source: string, st: FigureStatement): string | null;
	readConnector(source: string, st: FigureStatement): Connector | null;
	readNodeBox(source: string, st: FigureStatement): NodeBox | null;
	/** the outlines it draws a node's text in */
	nodeShapes: readonly NodeShape[];
	/** a node's text as the lines it is broken into; null for a statement with no text of its own */
	readNodeLines(source: string, st: FigureStatement): string[] | null;
	writeNodeLines(source: string, st: FigureStatement, lines: string[]): string | null;
	/** a node's, a cell's or a branch's text as it is typed */
	readText(source: string, st: FigureStatement): string | null;
	/** a node's, a cell's or a branch's text, braced where the diagram would read part of it as its own syntax */
	writeText(source: string, st: FigureStatement, text: string): string | null;
	/** where a node placed beside another one is, or null for one at a point */
	readPlacement(source: string, st: FigureStatement): NodePlacement | null;
	/** placed beside another node, or freed to a point: its middle there, in its own coordinates */
	writePlacement(source: string, st: FigureStatement, to: NodePlacement | { at: [number, number] }): string | null;
	/** a flowchart's next step: a node like statement `i`, placed on one of its sides, and an arrow to it; `at` is
	 *  where the new node is written */
	addStep(source: string, pictureIndex: number, i: number, side: NodeSide, text: string): PlacedEdit | null;
	/** the named points a path is drawn through, as the statements that set them; a move takes them along when `movable` */
	namedPoints(source: string, picture: FigurePicture, st: FigureStatement): { points: FigureStatement[]; movable: boolean };
	/** an outline chosen for a node with none gets drawn */
	writeNodeBox(source: string, st: FigureStatement, change: NodeBoxChange): string | null;
	/** the connector's end k moved: onto a node (named in the same edit when it has no name yet), or to a point in its own coordinates */
	attachEnd(source: string, pictureIndex: number, i: number, k: 0 | 1, to: Endpoint): string | null;
	writeConnector(
		source: string,
		st: FigureStatement,
		change: { route?: ConnectorRoute; bend?: number; label?: ConnectorLabel | null }
	): string | null;
	readAxis(source: string, st: FigureStatement): PlotAxis | null;
	writeAxis(source: string, st: FigureStatement, change: Partial<PlotAxis>): string | null;
	readPlot(source: string, st: FigureStatement): PlotSeries | null;
	writePlot(source: string, st: FigureStatement, change: Partial<PlotSeries>): string | null;
	/** another plot last in the axis: a function of x, or a few points to drag */
	addPlot(source: string, axis: FigureStatement, kind: 'function' | 'points'): string | null;
	/** a commutative diagram's grid, or null for a picture */
	readGrid(source: string, picture: FigurePicture): DiagramGrid | null;
	/** a new cell at a row and column, 0 or one past the last adding a row or column; `at` is where its text starts */
	addCell(source: string, pictureIndex: number, r: number, c: number, text: string): PlacedEdit | null;
	/** the cell taken to an empty row and column, its arrows and the arrows to it still meeting the same cells */
	moveCell(source: string, pictureIndex: number, i: number, r: number, c: number): PlacedEdit | null;
	readArrow(source: string, st: FigureStatement): DiagramArrow | null;
	writeArrow(source: string, st: FigureStatement, change: Partial<DiagramArrow>): string | null;
	/** the cells an arrow leaves and meets, by statement; null for a place with no cell */
	arrowCells(picture: FigurePicture, st: FigureStatement): [number, number | null] | null;
	/** the arrow's start (k = 0) or end (k = 1) moved onto another cell; `at` is where the arrow is written then */
	pointArrow(source: string, pictureIndex: number, i: number, k: 0 | 1, cell: number): PlacedEdit | null;
	/** a new branch with its text: the last child of the statement's branch, or the sibling after it */
	addBranch(source: string, st: FigureStatement, where: 'child' | 'sibling', text: string): PlacedEdit | null;
	/** the branch put last in another, which is not inside it */
	moveBranch(source: string, st: FigureStatement, onto: FigureStatement): PlacedEdit | null;
	/** the branch swapped with the sibling before or after it */
	shiftBranch(source: string, st: FigureStatement, by: -1 | 1): PlacedEdit | null;
	/** the library's elements, by group */
	libraryElements: readonly LibraryElement[];
	/** the element's statements last in the picture, with the packages and libraries it needs */
	addElement(source: string, pictureIndex: number, element: LibraryElement): string | null;
	/** the dimension last in the picture, its ends named where they are written; null where they cannot be */
	addDimension(source: string, pictureIndex: number, dimension: FigureDimension): string | null;
	/** the text with what an earlier version of the editor wrote in it written again as this one writes it */
	upToDate(source: string): string;
	/** a dimension as `addDimension` writes it, its ends found again; null for any other statement */
	readDimension(source: string, picture: FigurePicture, st: FigureStatement): FigureDimension | null;
	/** what the Trim tool can cut of it; null for what it leaves alone */
	trimmable(source: string, st: FigureStatement): TrimmableShape | null;
	/** the statement written again as what is left of it, its style kept */
	writeTrimmed(source: string, st: FigureStatement, left: TrimmedShape): string | null;
	/** dimension `i` printing `label`, or what it measures again with null */
	relabelDimension(source: string, pictureIndex: number, i: number, label: string | null): string | null;
	/** the parts the component tool offers */
	circuitParts: readonly CircuitPartKind[];
	/** the circuit parts a statement draws, in written order; empty for one that draws none */
	readCircuit(source: string, st: FigureStatement): CircuitPart[];
	/** part k of the statement changed: another type of the same kind, or its label, voltage or current, null taking one off */
	writeCircuit(source: string, st: FigureStatement, k: number, change: Partial<Omit<CircuitPart, 'placed'>>): string | null;
	/** the kinds of picture a file can take another of, the text each starts from, and the package it needs */
	newPictures: readonly NewPictureKind[];
	/** the new statement goes last; endpoints on nodes refer to them by name, named in the same edit */
	addShape(source: string, pictureIndex: number, shape: NewShape): string | null;

	/** with the frame statement's number, whose transform the frame is written in */
	readFrame(source: string, picture: FigurePicture): (FigureFrame & { i: number }) | null;
	writeFrame(source: string, picture: FigurePicture, rect: FigureFrame): string;

	readStyle(source: string, st: FigureStatement): ShapeStyle | null;
	writeStyle(source: string, st: FigureStatement, change: Partial<ShapeStyle>): string | null;
	styleChoices: {
		colors: FigureColors;
		widths: readonly string[];
		dashes: readonly string[];
		arrows: readonly { value: string; label: string }[];
		textSizes: readonly { value: string; label: string }[];
		opacities: readonly string[];
	};
};
