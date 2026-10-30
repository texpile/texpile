import type { Point } from '../../figure/geometry';

/** the object snaps CAD sketchers share, each with its own marker */
export type SnapKind = 'endpoint' | 'midpoint' | 'center' | 'quadrant' | 'intersection' | 'perpendicular';

/** a point found, in canvas bp */
export type Snap = { at: Point; kind: SnapKind };
export type FixedSnap = Snap & { stmt: number };
/** a straight piece of a drawn path, in canvas bp */
export type SnapSegment = { stmt: number; a: Point; b: Point };
/** a circle or an ellipse, square to the canvas, in canvas bp */
export type SnapCircle = { stmt: number; center: Point; rx: number; ry: number };

/** what can be snapped to: points that stand where they are, and the lines and circles found ones are made from */
export type SnapScene = { points: FixedSnap[]; segments: SnapSegment[]; circles: SnapCircle[] };
