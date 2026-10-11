import type { CallColor, CallLook } from '../file/snippetTypes';
import type { CallDialect } from './callWrappers';

// text on light, text on dark, and the fill a background is mixed from
const COLORS: Record<CallColor, [string, string, string]> = {
	red: ['#b91c1c', '#fca5a5', '#ef4444'],
	orange: ['#c2410c', '#fdba74', '#f97316'],
	yellow: ['#a16207', '#fde047', '#facc15'],
	green: ['#15803d', '#86efac', '#22c55e'],
	blue: ['#1d4ed8', '#93c5fd', '#3b82f6'],
	purple: ['#7e22ce', '#d8b4fe', '#a855f7'],
	gray: ['#404040', '#d4d4d4', '#a3a3a3']
};

function cssString(text: string): string {
	return `"${text.replace(/[\\"]/g, '\\$&')}"`;
}

function rules(selector: string, look: CallLook, dark: boolean): string {
	const side = dark ? 1 : 0;
	const decl: string[] = [];
	const label: string[] = [];
	if (look.color) decl.push(`color: ${COLORS[look.color][side]}`);
	if (look.background) decl.push(`background-color: color-mix(in srgb, ${COLORS[look.background][2]} ${dark ? 30 : 25}%, transparent)`);
	const hue = look.color ?? look.background;
	if (look.look === 'box') decl.push(`border: 1px solid ${hue ? COLORS[hue][side] : 'currentColor'}`);
	if (hue) label.push(`color: ${COLORS[hue][side]}`);
	if (dark)
		return [
			decl.length ? `${selector} { ${decl.join('; ')} }` : '',
			label.length ? `${selector}::before { ${label.join('; ')} }` : ''
		].join('\n');
	if (look.font.includes('bold')) decl.push('font-weight: 600');
	if (look.font.includes('italic')) decl.push('font-style: italic');
	if (look.font.includes('smallcaps')) decl.push('font-variant: small-caps');
	const lines = [look.font.includes('underline') && 'underline', look.font.includes('strike') && 'line-through'].filter(Boolean);
	if (lines.length) decl.push(`text-decoration: ${lines.join(' ')}`);
	// nothing declared but the name: a dotted line, so the call can still be told from the text around it
	if (!look.color && !look.background && !look.font.length && look.look === 'inline') decl.push('text-decoration: underline dotted');
	if (look.look === 'box') decl.push('padding: 0 0.25em', 'border-radius: 3px');
	else if (look.background) decl.push('padding: 0 1px', 'border-radius: 2px');
	if (look.label) label.push(`content: ${cssString(look.label)}`, 'margin-right: 0.3em', 'font-size: 0.7em', 'font-weight: 600');
	return [
		`${selector} { ${decl.join('; ')}; box-decoration-break: clone; -webkit-box-decoration-break: clone }`,
		look.label ? `${selector}::before { ${label.join('; ')} }` : ''
	].join('\n');
}

/** the stylesheet drawing each declared call, light and dark */
export function callLookCss(dialect: CallDialect, looks: ReadonlyMap<string, CallLook>): string {
	const out: string[] = [];
	for (const [name, look] of looks) {
		const selector = `.ProseMirror span[data-call-in="${dialect}"][data-call=${cssString(name)}]`;
		out.push(rules(selector, look, false), rules(`html[data-mode='dark'] ${selector}`, look, true));
	}
	return out.filter(Boolean).join('\n');
}

/** puts the dialect's stylesheet in the page, replacing the one before */
export function applyCallLookStyles(dialect: CallDialect, css: string): void {
	const id = `texpile-call-looks-${dialect}`;
	let style = document.getElementById(id);
	if (!style) {
		style = document.createElement('style');
		style.id = id;
		document.head.append(style);
	}
	style.textContent = css;
}
