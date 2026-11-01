import type { FigureFrame, FigureStatement, NodeSide, PlacedEdit, PointSpan, RadiusSpan } from '../../figure/figureLanguage';
import type { SourceTransform, Point } from '../../figure/geometry';
import type { ToolId } from '../editorState.types';
import type { DrawMode } from '../drawModes/drawModes';
import type { StatementBox } from '../snapTargets.types';
import type { StretchDrag } from '../selection/stretch';
import type { JoinedEnd } from '../selection/joinedEnds';

export type ShapePreview = {
	tool: Exclude<ToolId, 'hand' | 'select' | 'text' | 'state' | 'plot'>;
	points: Point[];
	circle: boolean;
	refs: [number | null, number | null];
	anchors: [string | null, string | null];
	chained?: boolean;
	byClicks?: boolean;
	mode?: DrawMode;
	leftStart?: boolean;
	free?: Point;
	startedIn?: number;
	part?: string;
};

/** `until` is that render's number, null while the drag goes on */
export type GestureOffset = { ids: number[]; by: Point; until: number | null; copy?: boolean };

export type EndAttachment = { ref: number; anchor: string | null; at: Point };
export type EndAttachmentLookup = (at: Point, exclude?: number[]) => EndAttachment | null;

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
	moving: boolean;
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
export type BendDrag = { kind: 'bend'; base: string; st: FigureStatement; ends: [Point, Point] };
export type RotateDrag = { kind: 'rotate'; base: string; center: Point; start: number; ids: number[] };
export type NodeSizeDrag = { kind: 'nodeSize'; base: string; st: FigureStatement; start: Point } & StretchDrag;
/** `from`: the node pressed, the start once the line leaves it; `free`: the press point, the start if it stays inside */
export type DrawDrag = { kind: 'draw'; start: Point; side?: NodeSide; from?: { ref: number; anchor: string | null }; free?: Point };
export type CellDrag = { kind: 'cell'; i: number; start: Point; middle: Point };
export type BranchDrag = { kind: 'branch'; i: number; start: Point; ids: number[] };
export type PanDrag = { kind: 'pan'; lastPx: Point };

export type EditDrag =
	PointDrag | RadiusDrag | EndDrag | FrameDrag | StatementStretchDrag | GroupStretchDrag | NodeSizeDrag | BendDrag | RotateDrag;

export type GestureDrag = EditDrag | SelectionMoveDrag | MarqueeDrag | DrawDrag | CellDrag | BranchDrag | PanDrag;
