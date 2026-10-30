/** x' = a x + c y + e, y' = b x + d y + f */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m after n: n applies first */
export function compose(m: Matrix, n: readonly number[]): Matrix {
	return [
		m[0] * n[0] + m[2] * n[1],
		m[1] * n[0] + m[3] * n[1],
		m[0] * n[2] + m[2] * n[3],
		m[1] * n[2] + m[3] * n[3],
		m[0] * n[4] + m[2] * n[5] + m[4],
		m[1] * n[4] + m[3] * n[5] + m[5]
	];
}

export function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
	return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** how much a line width grows under m */
export function scaleOf(m: Matrix) {
	return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
}
