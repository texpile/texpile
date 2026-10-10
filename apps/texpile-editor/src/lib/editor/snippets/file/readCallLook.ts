import { CALL_COLORS, CALL_FONTS, type CallColor, type CallFont, type CallLook } from './snippetTypes';

const FIELDS = new Set(['look', 'label', 'color', 'background', 'font', 'spellcheck']);
const LABEL_MAX = 40;

function colorOf(v: unknown, field: string): CallColor | undefined | string {
	if (v === undefined) return undefined;
	return CALL_COLORS.includes(v as CallColor) ? (v as CallColor) : `visual.${field} is not one of ${CALL_COLORS.join(', ')}`;
}

/** a wrap entry's `visual`; a string is the problem with it */
export function readCallLook(raw: unknown): CallLook | string {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'visual is not an object';
	const v = raw as Record<string, unknown>;
	const unknown = Object.keys(v).find((k) => !FIELDS.has(k));
	if (unknown) return `visual has no field "${unknown}"`;
	const look = v.look ?? 'inline';
	if (look !== 'inline' && look !== 'box') return 'visual.look is not inline or box';
	const label = v.label ?? '';
	if (typeof label !== 'string' || label.length > LABEL_MAX || /[\n\r]/.test(label))
		return `visual.label is not one line of up to ${LABEL_MAX} characters`;
	const color = colorOf(v.color, 'color');
	const background = colorOf(v.background, 'background');
	for (const c of [color, background]) if (c && !CALL_COLORS.includes(c as CallColor)) return c;
	const fonts = typeof v.font === 'string' ? [v.font] : (v.font ?? []);
	if (!Array.isArray(fonts) || !fonts.every((f) => CALL_FONTS.includes(f as CallFont)))
		return `visual.font is not from ${CALL_FONTS.join(', ')}`;
	if (v.spellcheck !== undefined && typeof v.spellcheck !== 'boolean') return 'visual.spellcheck is not true or false';
	return {
		look,
		label,
		color: color as CallColor | undefined,
		background: background as CallColor | undefined,
		font: fonts as CallFont[],
		spellcheck: v.spellcheck !== false
	};
}
