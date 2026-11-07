import type { MarkSpec } from 'prosemirror-model';
import { STYLED, SWITCHES, type Look, type TextStyle } from '$lib/languages/latex/visual/core/document';

export function lookOf(style: TextStyle): Look {
	return (style.form === 'arg' ? STYLED[style.command] : SWITCHES[style.command]) ?? {};
}

function cssOf(styles: TextStyle[]): string {
	const look: Record<string, string> = {};
	for (const style of styles) Object.assign(look, lookOf(style));
	return Object.entries(look)
		.map(([key, value]) => `${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}: ${value}`)
		.join('; ');
}

function stylesOf(dom: HTMLElement): TextStyle[] {
	try {
		const styles = JSON.parse(dom.getAttribute('data-text-style') ?? '[]');
		return Array.isArray(styles) ? styles : [];
	} catch {
		return [];
	}
}

export const textStyleMarkSpec: MarkSpec = {
	attrs: { styles: { default: [] } },
	parseDOM: [{ tag: 'span[data-text-style]', getAttrs: (dom: HTMLElement) => ({ styles: stylesOf(dom) }) }],
	toDOM: (mark) => {
		const styles = mark.attrs.styles as TextStyle[];
		return ['span', { class: 'text-style', 'data-text-style': JSON.stringify(styles), style: cssOf(styles) }, 0];
	}
};
