export function formatNumber(v: number) {
	const s = Number(v.toFixed(2)).toString();
	return s === '-0' ? '0' : s;
}

export function snapTo(v: number, step: number) {
	return step > 0 ? Math.round(v / step) * step : v;
}

export function formatPoint([x, y]: readonly [number, number]) {
	return `(${formatNumber(x)},${formatNumber(y)})`;
}
