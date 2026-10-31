import { applyMatrix, type Matrix } from '$lib/draw/editor/drawing/matrix';

function round(v: number) {
	return +v.toFixed(3);
}

/** path data with every point put through the matrix, as absolute M, L, C, Q and Z */
export function transformedPath(d: string, m: Matrix): { d: string; points: [number, number][] } {
	const tokens = d.match(/[MmLlHhVvCcSsQqTtZzAa]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
	let out = '';
	const points: [number, number][] = [];
	let [x, y, sx, sy] = [0, 0, 0, 0];
	let cmd = '';
	let k = 0;
	function num() {
		return Number(tokens[k++]);
	}
	function put(px: number, py: number) {
		const [tx, ty] = applyMatrix(m, px, py);
		points.push([tx, ty]);
		return `${round(tx)} ${round(ty)}`;
	}
	while (k < tokens.length) {
		if (/[a-zA-Z]/.test(tokens[k])) cmd = tokens[k++];
		const rel = cmd === cmd.toLowerCase();
		const [ox, oy] = rel ? [x, y] : [0, 0];
		switch (cmd.toUpperCase()) {
			case 'M':
				[x, y] = [ox + num(), oy + num()];
				[sx, sy] = [x, y];
				out += `M${put(x, y)}`;
				// further pairs after a moveto are lines
				cmd = rel ? 'l' : 'L';
				break;
			case 'L':
				[x, y] = [ox + num(), oy + num()];
				out += `L${put(x, y)}`;
				break;
			case 'H':
				x = (rel ? x : 0) + num();
				out += `L${put(x, y)}`;
				break;
			case 'V':
				y = (rel ? y : 0) + num();
				out += `L${put(x, y)}`;
				break;
			case 'C': {
				const c = [ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num()];
				out += `C${put(c[0], c[1])} ${put(c[2], c[3])} ${put(c[4], c[5])}`;
				[x, y] = [c[4], c[5]];
				break;
			}
			case 'Q': {
				const c = [ox + num(), oy + num(), ox + num(), oy + num()];
				out += `Q${put(c[0], c[1])} ${put(c[2], c[3])}`;
				[x, y] = [c[2], c[3]];
				break;
			}
			case 'Z':
				out += 'Z';
				[x, y] = [sx, sy];
				break;
			default:
				// arcs and smooth shorthands do not come out of Typst; skip their numbers
				k++;
		}
	}
	return { d: out, points };
}
