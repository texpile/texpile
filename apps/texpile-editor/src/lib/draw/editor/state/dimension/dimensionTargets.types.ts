import type { FigureStatement, PointSpan, RadiusSpan } from '../../figure/figureLanguage';
import type { Box, Point, SourceTransform } from '../../figure/geometry';
import type { AngleRays } from './geometry/angleGeometry';

export type DimensionPoint = { i: number; points: PointSpan[]; k: number; m: SourceTransform };

export type SegmentTarget = { kind: 'length'; i: number; points: PointSpan[]; a: number; b: number; m: SourceTransform };

/** each value is cm on the paper as the canvas shows it, an angle's in degrees */
export type DimensionTarget =
	| SegmentTarget
	| { kind: 'angle'; from: SegmentTarget; to: SegmentTarget }
	| { kind: 'side'; i: number; points: PointSpan[]; a: number; b: number; axis: 'x' | 'y'; m: SourceTransform }
	/** an arc's radius has no center point of its own: `angle` is its middle, where it is shown */
	| { kind: 'radius'; i: number; radius: RadiusSpan; m: SourceTransform; angle?: number }
	| { kind: 'node'; i: number; st: FigureStatement; box: Box; round?: boolean }
	| { kind: 'distance'; from: DimensionPoint; to: DimensionPoint };

export type DimensionPlacement =
	| { orient: 'aligned' | 'x' | 'y'; offset: number; side?: 1 | -1 }
	| { orient: 'angle'; rays: AngleRays; radius: number }
	| { orient: 'radius'; angle: number };

export type DimensionHit = { target: DimensionTarget } | { point: DimensionPoint; at: Point };
