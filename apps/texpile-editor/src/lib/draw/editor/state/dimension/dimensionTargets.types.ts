import type { FigureStatement, PointSpan, RadiusSpan } from '../../figure/figureLanguage';
import type { Box, Point, SourceTransform } from '../../figure/geometry';
import type { AngleRays } from './geometry/angleGeometry';

/** a point of a statement's own, as the source writes it */
export type DimensionPoint = { i: number; points: PointSpan[]; k: number; m: SourceTransform };

/** a straight segment, whose second end moves */
export type SegmentTarget = { kind: 'length'; i: number; points: PointSpan[]; a: number; b: number; m: SourceTransform };

/** what a dimension measures; each value is in cm on the paper, as the canvas shows it, an angle's in degrees */
export type DimensionTarget =
	| SegmentTarget
	/** between two segments, the second of which turns about its end nearer the first's line */
	| { kind: 'angle'; from: SegmentTarget; to: SegmentTarget }
	/** a rectangle's width or height, whose second corner moves */
	| { kind: 'side'; i: number; points: PointSpan[]; a: number; b: number; axis: 'x' | 'y'; m: SourceTransform }
	/** an arc's radius has no center point of its own: `angle` is its middle, where it is shown */
	| { kind: 'radius'; i: number; radius: RadiusSpan; m: SourceTransform; angle?: number }
	/** a node's or a plot's outline as TeX drew it, sized by its minimum width or height (a circle's both), a plot's by
	 *  its own */
	| { kind: 'node'; i: number; st: FigureStatement; box: Box; round?: boolean }
	/** between two points, the second of which moves */
	| { kind: 'distance'; from: DimensionPoint; to: DimensionPoint };

/** where a dimension is put, in bp: along what it measures or across or up, `offset` off it (from a node's side
 *  `side`, 1 above or right of it); an angle's ways and arc radius; a radius's way out, in degrees */
export type DimensionPlacement =
	| { orient: 'aligned' | 'x' | 'y'; offset: number; side?: 1 | -1 }
	| { orient: 'angle'; rays: AngleRays; radius: number }
	| { orient: 'radius'; angle: number };

/** what the pointer is over with the Dimension tool: something to measure, or a point a distance runs from or to */
export type DimensionHit = { target: DimensionTarget } | { point: DimensionPoint; at: Point };
