// the size a command's `value` states: "\vskip 3.0pt plus 1.0pt minus 1.0pt" is 3pt, "\kern .5em" is 0.5em, "\mskip 3mu" is 3/18em
import { commonFacts } from './commandFacts';

export type NaturalSize = { amount: number; unit: string };

const MU_PER_EM = 18;
const FILL_STRETCH = /\splus\s+\S*?fil{1,3}\b/;
const SIZE = /^([+-]?(?:\d+\.?\d*|\.\d+))\s*([a-z]{2})$/;

/** null when the value is no length (a name, a count) */
export function naturalSize(value: string | null | undefined): NaturalSize | null {
	const natural = (value ?? '')
		.replace(/^\s*\\(?:[vh]skip|m?kern|mskip)\s*/, '')
		.replace(/\s+(?:plus|minus)\s.*$/s, '')
		.trim();
	const m = SIZE.exec(natural);
	if (!m) return null;
	return m[2] === 'mu' ? { amount: Number(m[1]) / MU_PER_EM, unit: 'em' } : { amount: Number(m[1]), unit: m[2] };
}

/** what most files that define `name` give it, in `unit`; null when the data states no size or another unit */
export function commonSize(name: string, unit: string): number | null {
	const size = naturalSize(commonFacts(name).value);
	return size?.unit === unit ? size.amount : null;
}

/** commonSize of a length or skip register */
export function commonRegisterSize(name: string, unit: string): number | null {
	const { register } = commonFacts(name);
	return register === 'length' || register === 'skip' ? commonSize(name, unit) : null;
}

/** whether the data gives `name` infinite stretch (\hfill, \fill, \stretch) */
export function stretchesToFill(name: string): boolean {
	return FILL_STRETCH.test(commonFacts(name).value ?? '');
}
