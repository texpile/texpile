import type { Extension } from '@codemirror/state';
import type { Drawing } from '../drawing/drawing.types';
import type { LoadedFont } from '../drawing/fontOutlines';
import type { FigureEngine } from '../provider/figureEngine';
import type { Box, Point, SourceTransform } from './geometry';

export type TextSpan = { from: number; to: number };
export type NodeSide = 'north' | 'east' | 'south' | 'west';
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
	x: number;
	y: number;
	polar?: boolean;
	/** each length written in cm, which pgfplots needs where a bare number is in its axis units */
	cm?: boolean;
	/** '' for a point of its own, '+' or '++' for one written from the current point */
	relative?: '' | '+' | '++';
	base?: [number, number];
	/** the relative points written from this one, which keep their places when it moves */
	followers?: number[];
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
export type ArcSpan = RadiusSpan & { start: number; end: number };

/** what a statement paints unless told otherwise: the inspector offers stroke, fill or both from it */
export type StyleTarget = 'draw' | 'fill' | 'filldraw' | 'path' | 'node';

export type ShapeStyle = {
	stroke: string | null;
	fill: string | null;
	width: string | null;
	dash: string | null;
	arrows: string | null;
	textColor: string | null;
	textSize: string | null;
	/** percent, or `custom` */
	opacity: string | null;
	corners: 'sharp' | 'rounded' | null;
	/** the fill's pattern, '' for none, or `custom` */
	pattern: string | null;
};

export type StyleFieldSet = Record<'stroke' | 'fill' | 'width' | 'dash' | 'arrows' | 'text' | 'corners' | 'opacity' | 'pattern', boolean>;

export type StatementInfo = {
	/** what it is, by an id the editor keys its icons and counts by; a command it does not know is its own */
	kind: string;
	title: string;
	movable: boolean;
	target: StyleTarget | null;
	fields: StyleFieldSet;
	text: TextSpan | null;
	/** what the objects list calls it without text of its own: a diagram's arrow by the cells it joins */
	name: string | null;
};

export type Endpoint = Point | { ref: number; at: Point; anchor?: string | null };

export type ConnectorRoute =
	'straight' | 'hv' | 'vh' | 'bend left' | 'bend right' | 'curve' | 'loop above' | 'loop below' | 'loop left' | 'loop right';
export type ConnectorLabel = {
	text: string;
	pos: 'at start' | 'near start' | 'midway' | 'near end' | 'at end';
	side: 'above' | 'below' | 'left' | 'right' | null;
};
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
	| { tool: 'box'; from: Point; to: Point; shape?: NodeShape; angle?: number }
	| { tool: 'plot'; at: Point }
	| { tool: 'state'; at: Point }
	| { tool: 'component'; part: string; from: Endpoint; to: Endpoint }
	| { tool: 'component'; part: string; at: Point }
	| { tool: 'ellipse'; from: Point; to: Point; circle: boolean }
	| { tool: 'pen'; points: Point[] }
	| { tool: 'polygon'; points: Point[] }
	/** from is where the axes cross, to is how far they reach */
	| { tool: 'axes'; from: Point; to: Point }
	| { tool: 'text'; at: Point; text: string };

export type Arranged = { source: string; at: number[] };
export type ArrangeTarget = { before: number } | { after: number } | { into: number };

export type NodeShape = 'rectangle' | 'rounded' | 'terminal' | 'circle' | 'ellipse' | 'diamond' | 'slant' | 'cylinder';
/** a node's outline and the least size it keeps, in the picture's units; null sizes follow its text */
export type NodeBox = {
	/** null for an outline that is none of these, such as a library cloud */
	shape: NodeShape | null;
	w: number | null;
	h: number | null;
	state: { initial: boolean; accepting: boolean } | null;
};
export type PlaceDirection = 'above' | 'below' | 'left' | 'right' | 'above left' | 'above right' | 'below left' | 'below right';
/** a node placed beside another one, `distance` as written ('' takes the picture's node distance) */
export type NodePlacement = { direction: PlaceDirection; distance: string; of: string };
export type NodeBoxChange = Partial<Pick<NodeBox, 'shape' | 'w' | 'h'>> & { initial?: boolean; accepting?: boolean };

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
export type PlotSeries = {
	expression: string | null;
	domain: [number | null, number | null];
	color: string | null;
	mark: 'none' | '*' | 'o' | 'square*';
	line: 'solid' | 'dashed' | 'only marks';
};

/** a commutative diagram's arrow; the label's side is as seen along the arrow */
export type DiagramArrow = {
	label: string;
	side: 'left' | 'right' | 'on';
	head: 'to' | 'hook' | 'two heads' | 'mapsto' | 'dash' | 'Rightarrow' | 'equal';
	line: 'solid' | 'dashed' | 'dotted';
	bend: 'none' | 'left' | 'right';
};
/** a commutative diagram's cells by row and column, 1-based; `cell` is the statement showing there */
export type DiagramGrid = { rows: number; cols: number; cells: { r: number; c: number; cell: number }[] };
export type DiagramSlot = { r: number; c: number; at: Point };

export type LibraryElement = NewPictureKind & { group: string };

export type PointRef = { stmt: number; k: number };
export type LetGoReference = { stmt: number; name: string; anchor: string | null };
export type ArcSpans = [number, number][];
export type TrimRun = { points: Point[]; closed: boolean };
export type TrimmableShape =
	| { kind: 'polyline'; runs: TrimRun[] }
	| { kind: 'ellipse'; center: Point; rx: number; ry: number; spans?: ArcSpans }
	| { kind: 'node'; round: boolean };
export type TrimmedShape = { kind: 'polyline'; runs: TrimRun[] } | { kind: 'arcs'; center: Point; rx: number; ry: number; spans: ArcSpans };

/** a dimension written into the figure, which TeX draws and measures itself; offsets and radii in cm on the paper */
export type FigureDimension = (
	| { kind: 'aligned' | 'x' | 'y'; from: PointRef; to: PointRef; offset: number }
	/** a node's outline across or up, `side` 1 above or right of it, -1 below or left */
	| { kind: 'node'; stmt: number; axis: 'x' | 'y'; side: 1 | -1; offset: number }
	/** between two segments, each the way from its first point to its second, or back (`rays`) */
	| { kind: 'angle'; lines: [[PointRef, PointRef], [PointRef, PointRef]]; rays: [1 | -1, 1 | -1]; radius: number }
	| { kind: 'radius'; center: PointRef; length: number; value: number; angle: number }
) & {
	label?: string;
};

export type CircuitPartKind = { id: string; name: string; placed: 'path' | 'node'; pins: readonly string[]; icon: string };
export type CircuitPart = {
	type: string;
	placed: 'path' | 'node';
	label: string | null;
	voltage: string | null;
	current: string | null;
};
export type CircuitPin = { i: number; anchor: string; at: Point };

/** `thumb`: the picture as an image, for the starters and the library to show; the empty picture has none */
export type NewPictureKind = { id: string; name: string; text: string; usepackage: string | null; libraries: string[]; thumb?: string };

export type FigureFrame = Box;

export type RenderedFigure = {
	drawing: Drawing;
	fonts: Map<number, LoadedFont>;
	outline: (font: LoadedFont, code: number, gi?: number) => string | null;
	/** each statement's transform, by statement number, with its own options' (scale, rotate); 0 is the picture's own */
	transforms: Map<number, SourceTransform>;
	/** each statement's transform where it starts, before its own options, which a turn about a point is written in */
	outerTransforms: Map<number, SourceTransform>;
	errors: string[];
	errorLines: (number | null)[];
	failed: number[];
	slots: DiagramSlot[];
	pins: CircuitPin[];
	ms: number;
};

export type FigureColors = {
	swatches: [name: string, hex: string][];
	shades: readonly string[];
	split(color: string | null): { base: string | null; shade: string };
	join(base: string, shade: string): string;
	swatchFill(hex: string, shade: string): string;
};

/** collapsible text; `collapsed` starts it folded: what the editor writes for itself or is rarely read */
export type CodeFold = { from: number; to: number; label: string | null; collapsed: boolean };

export type FigureFeature = 'library' | 'dimensions' | 'trim' | 'states' | 'plots' | 'circuits';

export type FigureLanguage = {
	id: string;
	name: string;
	features: readonly FigureFeature[];
	engineName: string;
	newPicture: string;
	codeLanguage: Extension[];
	foldRanges(source: string): CodeFold[];
	listPictures(source: string): { from: number; to: number }[];
	unclosedPicture(source: string): { open: string; close: string; line: number } | null;
	withCommandAsPicture(source: string): string;
	withPicture(source: string): string;
	replacePicture(source: string, kind: NewPictureKind, index?: number): string;
	textProblem(text: string): string | null;
	readPicture(source: string, index: number): FigurePicture | null;
	statementAt(picture: FigurePicture, pos: number): FigureStatement | null;
	describe(source: string, st: FigureStatement): StatementInfo;
	render(engine: FigureEngine, source: string, picture: FigurePicture): Promise<RenderedFigure>;

	pathPoints(source: string, st: FigureStatement): PointSpan[];
	radii(source: string, st: FigureStatement): RadiusSpan[];
	arcs(source: string, st: FigureStatement): ArcSpan[];
	movePoint(source: string, points: PointSpan[], k: number, to: Point): string;
	/** `page` is the move in cm on the page, where a node's own shifts and distances count whatever the scale */
	shiftStatement(source: string, st: FigureStatement, du: number, dv: number, page?: [number, number]): string;
	stretchStatement(source: string, st: FigureStatement, anchor: Point, sx: number, sy: number): string;
	readRotation(source: string, st: FigureStatement): number | null;
	rotateStatement(source: string, st: FigureStatement, center: Point, degrees: number): string | null;
	duplicateStatement(source: string, st: FigureStatement, du: number, dv: number, page?: [number, number]): string;
	removeStatement(source: string, st: FigureStatement): string;
	letGoOf(
		source: string,
		pictureIndex: number,
		gone: number[],
		pointOf: (st: FigureStatement, ref: LetGoReference) => Point | null,
		placeOf: (st: FigureStatement) => Point | null
	): string;
	brokenNeed(before: string, after: string, pictureIndex: number): string | null;
	appendStatements(source: string, pictureIndex: number, text: string): string | null;
	isStatements(text: string): boolean;
	moveStatements(source: string, picture: FigurePicture, ids: number[], to: ArrangeTarget): Arranged | null;
	groupStatements(source: string, picture: FigurePicture, ids: number[]): Arranged | null;
	ungroupStatement(source: string, picture: FigurePicture, id: number): Arranged | null;
	readLabel(source: string, st: FigureStatement): string | null;
	writeLabel(source: string, st: FigureStatement, label: string): string;
	nameOf(source: string, st: FigureStatement): string | null;
	readConnector(source: string, st: FigureStatement): Connector | null;
	readNodeBox(source: string, st: FigureStatement): NodeBox | null;
	nodeShapes: readonly NodeShape[];
	readNodeLines(source: string, st: FigureStatement): string[] | null;
	writeNodeLines(source: string, st: FigureStatement, lines: string[]): string | null;
	readText(source: string, st: FigureStatement): string | null;
	/** a node's, a cell's or a branch's text, braced where the diagram would read part of it as its own syntax */
	writeText(source: string, st: FigureStatement, text: string): string | null;
	readPlacement(source: string, st: FigureStatement): NodePlacement | null;
	writePlacement(source: string, st: FigureStatement, to: NodePlacement | { at: [number, number] }): string | null;
	addStep(source: string, pictureIndex: number, i: number, side: NodeSide, text: string): PlacedEdit | null;
	namedPoints(source: string, picture: FigurePicture, st: FigureStatement): { points: FigureStatement[]; movable: boolean };
	writeNodeBox(source: string, st: FigureStatement, change: NodeBoxChange): string | null;
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
	addPlot(source: string, axis: FigureStatement, kind: 'function' | 'points'): string | null;
	readGrid(source: string, picture: FigurePicture): DiagramGrid | null;
	addCell(source: string, pictureIndex: number, r: number, c: number, text: string): PlacedEdit | null;
	moveCell(source: string, pictureIndex: number, i: number, r: number, c: number): PlacedEdit | null;
	readArrow(source: string, st: FigureStatement): DiagramArrow | null;
	writeArrow(source: string, st: FigureStatement, change: Partial<DiagramArrow>): string | null;
	arrowCells(picture: FigurePicture, st: FigureStatement): [number, number | null] | null;
	pointArrow(source: string, pictureIndex: number, i: number, k: 0 | 1, cell: number): PlacedEdit | null;
	addBranch(source: string, st: FigureStatement, where: 'child' | 'sibling', text: string): PlacedEdit | null;
	moveBranch(source: string, st: FigureStatement, onto: FigureStatement): PlacedEdit | null;
	shiftBranch(source: string, st: FigureStatement, by: -1 | 1): PlacedEdit | null;
	libraryElements: readonly LibraryElement[];
	addElement(source: string, pictureIndex: number, element: LibraryElement): string | null;
	addDimension(source: string, pictureIndex: number, dimension: FigureDimension): string | null;
	upToDate(source: string): string;
	readDimension(source: string, picture: FigurePicture, st: FigureStatement): FigureDimension | null;
	trimmable(source: string, st: FigureStatement): TrimmableShape | null;
	writeTrimmed(source: string, st: FigureStatement, left: TrimmedShape): string | null;
	relabelDimension(source: string, pictureIndex: number, i: number, label: string | null): string | null;
	circuitParts: readonly CircuitPartKind[];
	readCircuit(source: string, st: FigureStatement): CircuitPart[];
	writeCircuit(source: string, st: FigureStatement, k: number, change: Partial<Omit<CircuitPart, 'placed'>>): string | null;
	newPictures: readonly NewPictureKind[];
	addShape(source: string, pictureIndex: number, shape: NewShape): string | null;

	readFrame(source: string, picture: FigurePicture): (FigureFrame & { i: number }) | null;
	writeFrame(source: string, picture: FigurePicture, rect: FigureFrame): string;

	readStyle(source: string, st: FigureStatement): ShapeStyle | null;
	writeStyle(source: string, st: FigureStatement, change: Partial<ShapeStyle>): string | null;
	/** the text with what a style change needs in its preamble, once its statements are written */
	withStyleNeeds?(source: string, change: Partial<ShapeStyle>): string;
	styleChoices: {
		colors: FigureColors;
		widths: readonly string[];
		dashes: readonly string[];
		arrows: readonly { value: string; label: string }[];
		textSizes: readonly { value: string; label: string }[];
		opacities: readonly string[];
		patterns: readonly { value: string; label: string }[];
	};
};
