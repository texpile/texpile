export type GradientStop = { offset: number; color: number[] };

function numbersIn(s: string) {
	return (s.match(/-?\d*\.?\d+/g) ?? []).map(Number);
}

/** pgf's parsed shading function, a PDF stitching function of linear segments, as gradient stops */
export function shadingStops(domain: string, func: string): GradientStop[] {
	const [d0, d1] = numbersIn(domain);
	const starts = [...func.matchAll(/\/C0\s*\[([^\]]*)\]/g)].map((m) => numbersIn(m[1]));
	const ends = [...func.matchAll(/\/C1\s*\[([^\]]*)\]/g)].map((m) => numbersIn(m[1]));
	const bounds = numbersIn(func.match(/\/Bounds\s*\[([^\]]*)\]/)?.[1] ?? '');
	const span = d1 - d0 || 1;
	const at = [d0, ...bounds, d1].map((v) => Math.min(1, Math.max(0, (v - d0) / span)));
	const stops: GradientStop[] = [];
	starts.forEach((c0, k) => {
		stops.push({ offset: at[k] ?? 0, color: c0 });
		stops.push({ offset: at[k + 1] ?? 1, color: ends[k] ?? c0 });
	});
	return stops;
}
