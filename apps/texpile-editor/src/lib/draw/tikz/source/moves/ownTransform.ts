import { readCommandOptions } from '../options/optionList';
import type { Statement } from '../picture';

type Linear = [number, number, number, number];
const DEG = Math.PI / 180;
const NUM = String.raw`(-?\d*\.?\d+)`;
const KEYS: [RegExp, (n: number) => Linear][] = [
	[
		new RegExp(String.raw`^rotate around\s*=\s*\{\s*${NUM}\s*:`),
		(a) => [Math.cos(a * DEG), Math.sin(a * DEG), -Math.sin(a * DEG), Math.cos(a * DEG)]
	],
	[
		new RegExp(String.raw`^rotate\s*=\s*\{?\s*${NUM}\s*\}?$`),
		(a) => [Math.cos(a * DEG), Math.sin(a * DEG), -Math.sin(a * DEG), Math.cos(a * DEG)]
	],
	[new RegExp(String.raw`^scale\s*=\s*${NUM}$`), (s) => [s, 0, 0, s]],
	[new RegExp(String.raw`^xscale\s*=\s*${NUM}$`), (s) => [s, 0, 0, 1]],
	[new RegExp(String.raw`^yscale\s*=\s*${NUM}$`), (s) => [1, 0, 0, s]]
];

function times([a, b, c, d]: Linear, [e, f, g, h]: Linear): Linear {
	return [a * e + c * f, b * e + d * f, a * g + c * h, b * g + d * h];
}

/** the turns and scales a path's own options put its points through, in the order TikZ applies them: each later key
 *  in the frame the ones before it made */
function ownLinear(source: string, st: Statement): Linear {
	if (st.kind !== 'path') return [1, 0, 0, 1];
	return (readCommandOptions(source, st)?.items ?? []).reduce<Linear>(
		(m, item) => {
			const key = KEYS.find(([re]) => re.test(item));
			return key ? times(m, key[1](Number(key[0].exec(item)![1]))) : m;
		},
		[1, 0, 0, 1]
	);
}

/** a move where the statement starts, as one of its own points: through what its own options turn and scale */
export function ownDelta(source: string, st: Statement, du: number, dv: number): [number, number] {
	const [a, b, c, d] = ownLinear(source, st);
	const det = a * d - b * c || 1;
	return [(d * du - c * dv) / det, (-b * du + a * dv) / det];
}
