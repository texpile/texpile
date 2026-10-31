// the figure tabs on screen, for the tab strip and the source editors of their files
import { SvelteMap } from 'svelte/reactivity';
import { m } from '$lib/paraglide/messages';

type Range = { from: number; to: number };

/** offsets in the file's text as it is now; `picture` null while the figure is not there */
export type OpenFigure = { path: string; number: number | null; picture: Range | null; selected: Range[] };

const open = new SvelteMap<string, OpenFigure>();
const listeners = new Set<() => void>();

function changed(): void {
	for (const run of listeners) run();
}

export function publishFigure(id: string, figure: OpenFigure): void {
	open.set(id, figure);
	changed();
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

/** the figures open on a file, by their ids */
export function figuresOn(path: string, same: (a: string, b: string) => boolean): [string, OpenFigure][] {
	return [...open].filter(([, f]) => same(f.path, path));
}

export function onFiguresChange(run: () => void): () => void {
	listeners.add(run);
	return () => listeners.delete(run);
}

/** the figure's place among the file's pictures as it is now */
export function figureTabLabel(id: string, file: string): string {
	const number = open.get(id)?.number;
	return number ? m.figure_tab_label({ number, file }) : m.figure_tab_label_unnumbered({ file });
}
