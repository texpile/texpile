import { CALL_COLORS, CALL_FONTS, type CallColor, type CallFont, type CallLook } from './snippetTypes';

const FIELDS = new Set(['look', 'label', 'color', 'background', 'font', 'spellcheck']);
const LABEL_MAX = 40;

function colorOf(v: unknown, field: string): CallColor | undefined | string {
	if (v === undefined) return undefined;
	return CALL_COLORS.includes(v as CallColor)
		? (v as CallColor)
		: `"${field}" needs to be one of ${CALL_COLORS.map((c) => `"${c}"`).join(', ')}.`;
}

/** a wrap entry's `visual`; a string is the problem with it */
export function readCallLook(raw: unknown): CallLook | string {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return '"visual" needs to be in { }, like { "color": "red" }.';
	const v = raw as Record<string, unknown>;
	const unknown = Object.keys(v).find((k) => !FIELDS.has(k));
	if (unknown) return `"visual" has "${unknown}", which it does not know. It takes ${[...FIELDS].map((f) => `"${f}"`).join(', ')}.`;
	const look = v.look ?? 'inline';
	if (look !== 'inline' && look !== 'box') return '"look" needs to be "inline" or "box".';
	const label = v.label ?? '';
	if (typeof label !== 'string' || label.length > LABEL_MAX || /[\n\r]/.test(label))
		return `"label" needs to be one line of up to ${LABEL_MAX} characters.`;
	const color = colorOf(v.color, 'color');
	const background = colorOf(v.background, 'background');
	for (const c of [color, background]) if (c && !CALL_COLORS.includes(c as CallColor)) return c;
	const fonts = typeof v.font === 'string' ? [v.font] : (v.font ?? []);
	if (!Array.isArray(fonts) || !fonts.every((f) => CALL_FONTS.includes(f as CallFont)))
		return `"font" needs to be one or more of ${CALL_FONTS.map((f) => `"${f}"`).join(', ')}.`;
	if (v.spellcheck !== undefined && typeof v.spellcheck !== 'boolean') return '"spellcheck" needs to be true or false, without quotes.';
	return {
		look,
		label,
		color: color as CallColor | undefined,
		background: background as CallColor | undefined,
		font: fonts as CallFont[],
		spellcheck: v.spellcheck !== false
	};
}
