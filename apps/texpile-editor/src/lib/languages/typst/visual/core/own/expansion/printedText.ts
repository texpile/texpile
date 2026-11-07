// the text Typst prints for a value handed to markup (`#x` with x = 0xff prints 255)

const MINUS = '−';
const TO_PT: Record<string, number> = { pt: 1, mm: 72 / 25.4, cm: 72 / 2.54, in: 72 };
const NUMERIC = /^(.*?)(pt|mm|cm|in|em|fr|deg|rad|%)$/;

export function escapedMarkup(text: string): string {
	return text.replace(/[\\*_#$@<>[\]`~=+\-/]/g, (c) => `\\${c}`).replace(/^(\s*\d+)\.(?=\s|$)/gm, '$1\\.');
}

function plainDecimal(value: number): string {
	const text = String(Math.abs(value));
	const parts = /^(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(text);
	if (!parts) return text;
	const digits = parts[1] + (parts[2] ?? '');
	const point = parts[1].length + Number(parts[3]);
	if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`;
	if (point >= digits.length) return digits + '0'.repeat(point - digits.length);
	return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

function incremented(digits: string): string {
	const out = digits.split('');
	for (let i = out.length - 1; i >= 0; i--) {
		if (out[i] !== '9') {
			out[i] = String(Number(out[i]) + 1);
			return out.join('');
		}
		out[i] = '0';
	}
	return `1${out.join('')}`;
}

function roundedToTwo(value: number): string {
	const text = plainDecimal(value);
	const [whole, fraction = ''] = text.split('.');
	if (fraction.length <= 2) return text;
	const kept = whole + fraction.slice(0, 2);
	const digits = fraction[2] >= '5' ? incremented(kept) : kept;
	const integer = digits.slice(0, -2).replace(/^0+(?=\d)/, '') || '0';
	const decimals = digits.slice(-2).replace(/0+$/, '');
	return decimals ? `${integer}.${decimals}` : integer;
}

export function printedNumber(value: number, int: boolean): string | null {
	if (Number.isNaN(value)) return 'NaN';
	if (!Number.isFinite(value)) return value < 0 ? `${MINUS}∞` : '∞';
	if (int && !Number.isSafeInteger(value)) return null;
	return `${value < 0 ? MINUS : ''}${plainDecimal(value)}`;
}

export function printedNumeric(text: string): string | null {
	const parts = NUMERIC.exec(text);
	const value = parts ? Number(parts[1]) : NaN;
	if (!parts || !Number.isFinite(value)) return null;
	const unit = parts[2];
	if (unit in TO_PT) return `${roundedToTwo(value * TO_PT[unit])}pt`;
	if (unit === 'rad') return `${roundedToTwo((value * 180) / Math.PI)}deg`;
	return `${roundedToTwo(value)}${unit}`;
}
