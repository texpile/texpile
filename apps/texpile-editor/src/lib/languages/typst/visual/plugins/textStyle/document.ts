import type { TypstDocumentPlugin, TypstMarkWrap } from '$lib/languages/typst/visual/core/document';
import { markCall, styledCall } from './textStyleImport';
import { typCallSpec, typTextSpec } from './textStyleSchema';
import { TYPST_CSS_COLORS } from './typstColors';

// cyan/magenta are CSS-only names the dropdowns can produce, mapped to their rgb forms
const CSS_ONLY_COLORS: Record<string, string> = { cyan: '#00ffff', magenta: '#ff00ff' };

/** a mark's CSS color -> a typst color expression, or null when unrepresentable. */
function typColor(css: string): string | null {
	const v = css.trim().toLowerCase();
	if (TYPST_CSS_COLORS.has(v)) return v;
	const hex = CSS_ONLY_COLORS[v] ?? (/^#[0-9a-f]{3,8}$/.test(v) ? v : null);
	return hex ? `rgb(${JSON.stringify(hex)})` : null;
}

// the marks nest in this order, outermost first
const marks: Record<string, (attrs: Record<string, unknown>) => TypstMarkWrap> = {
	typ_text: (a) => ({ open: `#text(${String(a.args ?? '')})[`, close: ']' }),
	typ_call: (a) => ({ open: `#${String(a.name ?? 'strike')}${typeof a.args === 'string' ? `(${a.args})` : ''}[`, close: ']' }),
	textcolor: (a) => {
		const t = typColor(String(a.color ?? ''));
		return t ? { open: `#text(fill: ${t})[`, close: ']' } : { open: '', close: '' };
	},
	// an unrepresentable color (a pasted CSS value typst has no name for) drops the wrapper but
	// keeps the content - the color was never expressible in the file
	highlight: (a) => {
		const c = String(a.color ?? 'yellow')
			.trim()
			.toLowerCase();
		if (c === 'yellow') return { open: '#highlight[', close: ']' };
		const t = typColor(c);
		return t ? { open: `#highlight(fill: ${t})[`, close: ']' } : { open: '', close: '' };
	},
	u: () => ({ open: '#underline[', close: ']' }),
	sup: () => ({ open: '#super[', close: ']' }),
	sub: () => ({ open: '#sub[', close: ']' })
};

export const textStyleDocument: TypstDocumentPlugin = {
	import: {
		calls: { inline: { underline: markCall, super: markCall, sub: markCall, highlight: markCall, text: markCall } },
		roles: { elements: styledCall }
	},
	schema: ({ nodes, marks: specs }) => ({ nodes, marks: specs.addToEnd('typ_text', typTextSpec).addToEnd('typ_call', typCallSpec) }),
	save: { marks }
};
