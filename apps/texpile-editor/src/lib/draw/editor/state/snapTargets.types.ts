import type { Box } from '../figure/geometry';

export type StatementBox = Box & { stmt: number };
/** `tracking`: a line from a point lined up with, dotted as CAD's are */
export type Guide = { axis: 'x' | 'y'; at: number; from: number; to: number; tracking?: boolean };
