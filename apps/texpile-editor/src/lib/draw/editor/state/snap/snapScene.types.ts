import type { Point } from '../../figure/geometry';

export type SnapKind = 'endpoint' | 'midpoint' | 'center' | 'quadrant' | 'intersection' | 'perpendicular';

export type Snap = { at: Point; kind: SnapKind };
export type FixedSnap = Snap & { stmt: number };
export type SnapSegment = { stmt: number; a: Point; b: Point };
export type SnapCircle = { stmt: number; center: Point; rx: number; ry: number };

export type SnapScene = { points: FixedSnap[]; segments: SnapSegment[]; circles: SnapCircle[] };
