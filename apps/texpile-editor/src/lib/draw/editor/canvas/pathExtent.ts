type Visit = (x: number, y: number) => void;

/** where a cubic's coordinate on one axis turns, for t strictly between its ends */
function turns(p0: number, p1: number, p2: number, p3: number) {
	const a = -p0 + 3 * p1 - 3 * p2 + p3;
	const b = 2 * (p0 - 2 * p1 + p2);
	const c = p1 - p0;
	if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b];
	const disc = b * b - 4 * a * c;
	if (disc < 0) return [];
	const root = Math.sqrt(disc);
	return [(-b + root) / (2 * a), (-b - root) / (2 * a)];
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number) {
	const u = 1 - t;
	return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** every point a path's outline reaches to: its corners, and on a curve its ends and where it turns, never its control points */
export function visitPathExtent(d: string, visit: Visit) {
	const tokens = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
	let at: [number, number] = [0, 0];
	let command = '';
	for (let k = 0; k < tokens.length;) {
		if (/[MLCZ]/.test(tokens[k])) command = tokens[k++];
		if (command === 'Z') continue;
		if (command === 'C') {
			const [x1, y1, x2, y2, x, y] = tokens.slice(k, k + 6).map(Number);
			k += 6;
			for (const t of [...turns(at[0], x1, x2, x), ...turns(at[1], y1, y2, y)])
				if (t > 0 && t < 1) visit(cubicAt(at[0], x1, x2, x, t), cubicAt(at[1], y1, y2, y, t));
			at = [x, y];
		} else {
			at = [Number(tokens[k]), Number(tokens[k + 1])];
			k += 2;
		}
		visit(at[0], at[1]);
	}
}
