// column widths (CSS 2.1 17.5.2): auto layout between the columns' min-content and max-content widths, fixed layout
// from the widths the columns state

/** a column's min-content and max-content widths and the width it states, borders and padding of its cells included */
export type ColumnWidths = { min: number; max: number; fixed: number | null };

function sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

/** shares `amount` out in proportion to the weights, equally when they are all zero */
export function shareOut(amount: number, weights: readonly number[]): number[] {
	const total = sum(weights);
	return weights.map((weight) => (total > 0 ? (amount * weight) / total : amount / Math.max(1, weights.length)));
}

/** auto layout: every column at its min below the min widths, between min and max in proportion, past the max widths the
 * columns that state no width grow in proportion to their max widths */
export function autoColumnWidths(columns: readonly ColumnWidths[], grid: number): number[] {
	const mins = columns.map((column) => column.min);
	const maxes = columns.map((column) => Math.max(column.min, column.max));
	const minSum = sum(mins);
	const maxSum = sum(maxes);
	if (grid <= minSum) return mins;
	if (grid <= maxSum) {
		const share = (grid - minSum) / (maxSum - minSum);
		return columns.map((_, i) => mins[i] + (maxes[i] - mins[i]) * share);
	}
	const growing = columns.map((column) => (columns.some((each) => each.fixed === null) ? column.fixed === null : true));
	const weights = maxes.map((max, i) => (growing[i] ? max : 0));
	const extra = shareOut(grid - maxSum, sum(weights) > 0 ? weights : growing.map(Number));
	return maxes.map((max, i) => max + extra[i]);
}

/** fixed layout: stated widths as they are, the rest of the grid shared equally by the others; with every column
 * stated, the grid's extra width goes to them in proportion */
export function fixedColumnWidths(stated: readonly (number | null)[], grid: number): number[] {
	const known = sum(stated.map((width) => width ?? 0));
	const open = stated.filter((width) => width === null).length;
	if (open) {
		const each = Math.max(0, (grid - known) / open);
		return stated.map((width) => width ?? each);
	}
	if (grid <= known || known === 0) return stated.map((width) => width!);
	const extra = shareOut(grid - known, stated as number[]);
	return stated.map((width, i) => width! + extra[i]);
}
