import { SvelteMap } from 'svelte/reactivity';
import { m } from '$lib/paraglide/messages';

type Range = { from: number; to: number };

export type OpenFigure = { path: string; number: number | null; picture: Range | null; selected: Range[] };

const open = new SvelteMap<string, OpenFigure>();
// a figure tab behind another is not mounted, and keeps the number it had
const lastNumbers = new SvelteMap<string, number>();
const listeners = new Set<() => void>();
const numberListeners = new Set<() => void>();

function changed(): void {
	for (const run of listeners) run();
}

export function publishFigure(id: string, figure: OpenFigure): void {
	open.set(id, figure);
	const { number } = figure;
	const renumbered = number !== null && lastNumbers.get(id) !== number;
	if (renumbered) lastNumbers.set(id, number);
	changed();
	if (renumbered) for (const run of numberListeners) run();
}

export function onFigureNumbered(run: () => void): () => void {
	numberListeners.add(run);
	return () => numberListeners.delete(run);
}

export function openFigureCount(): number {
	return open.size;
}

export function closeFigure(id: string): void {
	if (open.delete(id)) changed();
}

export function openFigure(id: string): OpenFigure | undefined {
	return open.get(id);
}

export function figuresOn(path: string, same: (a: string, b: string) => boolean): [string, OpenFigure][] {
	return [...open].filter(([, f]) => same(f.path, path));
}

export function onFiguresChange(run: () => void): () => void {
	listeners.add(run);
	return () => listeners.delete(run);
}

export function figureNumber(id: string): number | null {
	const shown = open.get(id);
	if (shown) return shown.number;
	const restored = /^r(\d+):/.exec(id);
	return lastNumbers.get(id) ?? (restored ? Number(restored[1]) : null);
}

export function figureTabLabel(id: string, file: string): string {
	const number = figureNumber(id);
	return number ? m.figure_tab_label({ number, file }) : m.figure_tab_label_unnumbered({ file });
}
