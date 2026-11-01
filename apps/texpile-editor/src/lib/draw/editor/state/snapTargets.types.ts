import type { Box } from '../figure/geometry';

export type StatementBox = Box & { stmt: number };
export type Guide = { axis: 'x' | 'y'; at: number; from: number; to: number; tracking?: boolean };
