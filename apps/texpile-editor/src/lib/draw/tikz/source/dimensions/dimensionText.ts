import { formatNumber } from '$lib/draw/editor/figure/numbers';

/** what `dimension` draws in, as CAD draws one: thin, with filled arrowheads and its value above its line; it keeps the
 *  picture's own scale, which `let` measures without */
export const DIMENSION_STYLE =
	'dimension/.style={thin, >=latex, every node/.style={inner sep=1.5pt, font=\\footnotesize}, ' +
	'/utils/exec={\\pgfgettransformentries{\\dimxx}{\\dimxy}{\\dimyx}{\\dimyy}{\\dimtx}{\\dimty}}}';
// \p1 as the picture's scale and turn draw it, and how long one of its units across and up is on the paper
const PAPER_VECTOR = '\\dimxx*\\x1+\\dimyx*\\y1,\\dimxy*\\x1+\\dimyy*\\y1';
const UNIT_ACROSS = 'veclen(\\dimxx,\\dimxy)';
const UNIT_UP = 'veclen(\\dimyx,\\dimyy)';

// pt on the paper to cm, as TeX measures the dimension's own ends
const CM = '28.45274';
// a node's anchors lie half its line out from its outline, either side
const NODE_LINE = '0.4';

function value(expression: string, precision = 2) {
	return `\\pgfmathparse{${expression}}\\pgfmathprintnumber[fixed,precision=${precision}]{\\pgfmathresult}`;
}

// an extension line starts this far off the point it measures
const GAP = 'shorten <=0.8mm';

/** the extension lines reach a little past the dimension line */
function past(offset: number) {
	return formatNumber(offset + (offset < 0 ? -0.1 : 0.1));
}

/** between two points, along the line from one to the other, `offset` cm off it to the left */
export function alignedText(a: string, b: string, offset: number, label: string | null = null) {
	const [o, O] = [formatNumber(offset), past(offset)];
	return (
		`\\draw[dimension] let \\p1 = ($(${b})-(${a})$) in (${a}) edge[${GAP}] ($(${a})!${O}cm!90:(${b})$) (${b}) edge[${GAP}] ($(${b})!${O}cm!-90:(${a})$) ` +
		`($(${a})!${o}cm!90:(${b})$) edge[<->] node[sloped, above] {${label ?? value(`veclen(${PAPER_VECTOR})/${CM}`)}} ($(${b})!${o}cm!-90:(${a})$);`
	);
}

/** between two points across (`x`) or up (`y`), `offset` cm from the first; a node's outline less its line */
export function axisText(a: string, b: string, axis: 'x' | 'y', offset: number, node = false, label: string | null = null) {
	const [o, O] = [formatNumber(offset), past(offset)];
	// a node's two corners are already square to each other
	const [at, over, size] =
		axis === 'x'
			? [node ? `(${b})` : `(${b} |- ${a})`, (d: string) => `(0,${d}cm)`, `abs(\\x1)*${UNIT_ACROSS}`]
			: [node ? `(${b})` : `(${b} -| ${a})`, (d: string) => `(${d}cm,0)`, `abs(\\y1)*${UNIT_UP}`];
	const length = node ? `(${size}-${NODE_LINE})/${CM}` : `${size}/${CM}`;
	return (
		`\\draw[dimension] let \\p1 = ($(${b})-(${a})$) in (${a}) edge[${GAP}] ($(${a})+${over(O)}$) (${b}) edge[${GAP}] ($${at}+${over(O)}$) ` +
		`($(${a})+${over(o)}$) edge[<->] node[${axis === 'x' ? 'above' : 'sloped, above'}] {${label ?? value(length)}} ($${at}+${over(o)}$);`
	);
}

/** the angle at `vertex` from the way `a1` to `b1` round to the way `a2` to `b2`, the shorter way, its arc `radius` cm out */
export function angleText(
	vertex: string,
	[a1, b1]: [string, string],
	[a2, b2]: [string, string],
	radius: number,
	label: string | null = null
) {
	const r = formatNumber(radius);
	return (
		`\\draw[dimension, <->] let \\p0 = (${vertex}), \\p1 = ($(${b1})-(${a1})$), \\p2 = ($(${b2})-(${a2})$), ` +
		`\\n1 = {atan2(\\y1,\\x1)}, \\n2 = {atan2(\\y2,\\x2)}, \\n3 = {mod(\\n2-\\n1+540,360)-180}, \\n4 = {\\n1+\\n3/2+180} in ` +
		`($(\\p0)+(\\n1:${r}cm)$) arc[start angle=\\n1, delta angle=\\n3, radius=${r}cm] ` +
		`node[pos=0.5, anchor=\\n4] {${label ?? `${value('abs(\\n3)', 1)}$^\\circ$`}};`
	);
}

/** a radius out from `center` at `angle` degrees, `length` long in the picture's units, reading `value` */
export function radiusText(center: string, length: number, value: number, angle: number, label: string | null = null) {
	const a = formatNumber(angle);
	return `\\draw[dimension, ->] (${center}) -- ++(${a}:${formatNumber(length)}) node[anchor=${formatNumber((angle + 180) % 360)}] {${label ?? `R ${formatNumber(value)}`}};`;
}
