// the colors every document has (xcolor's base set) as CSS; one the document mixes or defines itself is not drawn
import { commonRegistry } from '$lib/languages/latex/knowledge/registries/registries';

function share(value: number): string {
	return `${Math.round(value * 1000) / 10}%`;
}

function cssOf(value: string): string | null {
	const [model, list = ''] = value.split(':');
	const n = list.split(',').map(Number);
	if (n.some(Number.isNaN)) return null;
	if (model === 'rgb' && n.length === 3) return `rgb(${n.map(share).join(' ')})`;
	if (model === 'gray' && n.length === 1) return `rgb(${[n[0], n[0], n[0]].map(share).join(' ')})`;
	const [c, m, y, k] = n;
	if (model === 'cmyk' && n.length === 4) return `rgb(${[c, m, y].map((part) => share((1 - part) * (1 - k))).join(' ')})`;
	return null;
}

const BASE = new Map(
	commonRegistry('colors').flatMap((color) => {
		const css = !color.if && color.value ? cssOf(color.value) : null;
		return css ? [[color.name, css] as const] : [];
	})
);

export function cssColor(name: string): string | null {
	return BASE.get(name.trim()) ?? null;
}
