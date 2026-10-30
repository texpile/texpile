import type { FigureFrame, FigureStatement, NodeSide, PlacedEdit, PointSpan, RadiusSpan } from '../../figure/figureLanguage';
import type { SourceTransform, Point } from '../../figure/geometry';
import type { ToolId } from '../editorState.types';
import type { DrawMode } from '../drawModes/drawModes';
import type { StatementBox } from '../snapTargets.types';
import type { StretchDrag } from '../selection/stretch';
import type { JoinedEnd } from '../selection/joinedEnds';

/** a shape being drawn, in source units; the canvas shows it until it is written */
export type ShapePreview = {
	tool: Exclude<ToolId, 'hand' | 'select' | 'text' | 'state' | 'plot'>;
	points: Point[];
	circle: boolean;
	refs: [number | null, number | null];
	/** the anchor each end meets its node at; null for its border */
	anchors: [string | null, string | null];
	/** a line drawn click by click, its last point where the pointer is */
	chained?: boolean;
	/** a rectangle or an ellipse drawn click by click, as many as its mode takes, its last point where the pointer is */
	byClicks?: boolean;
	/** how a rectangle or an ellipse is drawn */
	mode?: DrawMode;
	/** the pointer has been off the node the line started on, so coming back onto it is a loop */
	leftStart?: boolean;
	/** where a line drawn click by click from inside a node was pressed: its start, if its next point is in that node */
	free?: Point;
	/** the node a line drawn click by click was started in: a click in it is a point of the line, never its end */
	startedIn?: number;
	/** the circuit part a component is drawn as, in place of the tool's: a wire out of a pin */
	part?: string;
};

/** a dragged statement's offset in bp, kept until the engine has drawn it where it landed or given up; `until` is
 *  that render's number, null while the drag goes on */
export type GestureOffset = { ids: number[]; by: Point; until: number | null; copy?: boolean };

/** the node an end would meet, in the coordinates new shapes are written in */
export type EndAttachment = { ref: number; anchor: string | null; at: Point };
export type EndAttachmentLookup = (at: Point, exclude?: number[]) => EndAttachment | null;

/** what a press that never became a drag does to the selection when it is let go */
export type PressRelease = { kind: 'keep' } | { kind: 'only'; i: number } | { kind: 'remove'; i: number } | { kind: 'clear' };

export type SelectionMoveDrag = {
	kind: 'move';
	ids: number[];
	start: Point;
	startPx: Point;
	m: SourceTransform;
	points: PointSpan[];
	delta: Point;
	box: StatementBox | null;
	release: PressRelease;
	/** past the threshold: the press is a drag now */
	moving: boolean;
	/** Alt at the press: the copies move, the originals stay */
	copy: boolean;
};
/** `locked` is the locked shape the press landed on, which a click without a drag offers to unlock */
export type MarqueeDrag = { kind: 'marquee'; start: Point; startPx: Point; base: number[]; locked: number };
/** `joined`: a circuit's other ends at the point, which go with it */
export type PointDrag = {
	kind: 'point';
	start: Point;
	m: SourceTransform;
	base: string;
	points: PointSpan[];
	k: number;
	joined: JoinedEnd[];
};
export type RadiusDrag = { kind: 'radius'; m: SourceTransform; base: string; radius: RadiusSpan };
/** a connector's end, or a diagram arrow's, which `placed` holds once it is on another cell */
export type EndDrag = {
	kind: 'end';
	m: SourceTransform;
	base: string;
	i: number;
	k: 0 | 1;
	placed?: PlacedEdit | null;
};
export type FrameDrag = { kind: 'frame'; m: SourceTransform; base: string; frame: FigureFrame; axes: 'x' | 'y' | 'xy' };
export type StatementStretchDrag = { kind: 'stretch'; m: SourceTransform; base: string; st: FigureStatement; start: Point } & StretchDrag;
export type GroupStretchDrag = {
	kind: 'stretchGroup';
	m: SourceTransform;
	base: string;
	group: FigureStatement[];
	start: Point;
} & StretchDrag;
/** a connector's middle pulled off its line, which bends it; `ends` where they are drawn, in bp */
export type BendDrag = { kind: 'bend'; base: string; st: FigureStatement; ends: [Point, Point] };
/** the selection turned about `center`, in canvas bp, from the pointer's angle `start` (radians) */
export type RotateDrag = { kind: 'rotate'; base: string; center: Point; start: number; ids: number[] };
/** a node's box sized from a side or a corner, in canvas bp */
export type NodeSizeDrag = { kind: 'nodeSize'; base: string; st: FigureStatement; start: Point } & StretchDrag;
/** a new shape, or an arrow out of a node's `side`, where a click alone adds the next step */
/** `from`: the node the press was on, which a line or an arrow starts from once it leaves it; `free`: where the press
 *  was, which a line kept inside that node starts from instead */
export type DrawDrag = { kind: 'draw'; start: Point; side?: NodeSide; from?: { ref: number; anchor: string | null }; free?: Point };
/** a diagram's cell, carried to a free place on its grid */
export type CellDrag = { kind: 'cell'; i: number; start: Point; middle: Point };
/** a tree's branch, carried onto another node with everything under it */
export type BranchDrag = { kind: 'branch'; i: number; start: Point; ids: number[] };
export type PanDrag = { kind: 'pan'; lastPx: Point };

/** a drag that shows its edit to the text as it goes and writes it when let go */
export type EditDrag =
	PointDrag | RadiusDrag | EndDrag | FrameDrag | StatementStretchDrag | GroupStretchDrag | NodeSizeDrag | BendDrag | RotateDrag;

export type GestureDrag = EditDrag | SelectionMoveDrag | MarqueeDrag | DrawDrag | CellDrag | BranchDrag | PanDrag;
