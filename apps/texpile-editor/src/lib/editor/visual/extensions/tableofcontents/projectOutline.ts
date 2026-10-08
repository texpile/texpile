// The Contents of the whole paper around the open file: the main file down its \input chain, numbered as one
// document. The open file's own entries keep positions in its editor; every other file's carry it, to open it there
import type { TocItem } from './tocStore';
import { assembleOutline, parseOutlineRaw, type RawOutlineItem } from './latexHeadings';
import { dirname, joinPath, normalizePath, pathKey, samePath } from '$lib/workspace/fileSystem';
import type { TypstOutline } from '$lib/stores/projectIntel';

export type ProjectOutlineInput = {
	main: string;
	open: string;
	/** the open file's text as its editor has it now */
	openSource: string;
	root: string | null;
	/** the other files' outlines, from the project scan */
	outlines: Record<string, RawOutlineItem[]>;
};

/** null when there is no paper to place the open file in: the main file is not scanned, or never reaches it */
export function latexProjectOutline(input: ProjectOutlineInput): TocItem[] | null {
	const { main, open, root } = input;
	const openRaw = parseOutlineRaw(input.openSource);
	const outlines = { ...input.outlines, [open]: openRaw };
	const mainRaw = samePath(main, open) ? openRaw : Object.entries(outlines).find(([file]) => samePath(file, main))?.[1];
	if (!mainRaw) return null;
	const { items, files } = assembleOutline(mainRaw, main, dirname(main), root, outlines, open);
	return files.some((f) => samePath(f, open)) ? items : null;
}

/** with no main file chosen yet: the scanned file whose \input chain reaches the open one and the most files besides */
export function guessedLatexMain(input: Omit<ProjectOutlineInput, 'main'>): string | null {
	const { open, root } = input;
	const outlines = { ...input.outlines, [open]: parseOutlineRaw(input.openSource) };
	let best: { file: string; reach: number } | null = null;
	for (const [file, raw] of Object.entries(outlines)) {
		const { files } = assembleOutline(raw, file, dirname(file), root, outlines, open);
		if (files.length > 1 && files.some((f) => samePath(f, open)) && files.length > (best?.reach ?? 0)) best = { file, reach: files.length };
	}
	return best?.file ?? null;
}

/** a Typst paper's: the main file down its #include chain, each file's headings around the spots it includes others */
export function typstProjectOutline(input: {
	main: string;
	open: string;
	openOutline: TypstOutline;
	outlines: Record<string, TypstOutline>;
}): TocItem[] | null {
	const { main, open } = input;
	const byKey = new Map(Object.entries(input.outlines).map(([file, o]) => [pathKey(normalizePath(file)), o]));
	byKey.set(pathKey(normalizePath(open)), input.openOutline);
	const seen = new Set<string>();
	let reached = false;
	function walk(file: string, depth: number): TocItem[] {
		const key = pathKey(normalizePath(file));
		const outline = byKey.get(key);
		if (!outline || seen.has(key) || depth > 20) return [];
		seen.add(key);
		const own = samePath(file, open);
		reached ||= own;
		const { items } = outline;
		const out: TocItem[] = [];
		let k = 0;
		function take(until: number): void {
			for (; k < items.length && items[k].pos < until; k++) out.push(own ? items[k] : { ...items[k], file });
		}
		for (const inc of [...outline.includes].sort((a, b) => a.pos - b.pos)) {
			take(inc.pos);
			out.push(...walk(joinPath(dirname(file), inc.target), depth + 1));
		}
		take(Infinity);
		return out;
	}
	const paper = walk(main, 0);
	return reached ? paper : null;
}

/** the same guess for Typst, down #include */
export function guessedTypstMain(open: string, outlines: Record<string, TypstOutline>): string | null {
	const byKey = new Map(Object.entries(outlines).map(([file, o]) => [pathKey(normalizePath(file)), o]));
	function reach(file: string, seen: Set<string>): Set<string> {
		const key = pathKey(normalizePath(file));
		if (seen.has(key) || seen.size > 200) return seen;
		seen.add(key);
		for (const inc of byKey.get(key)?.includes ?? []) reach(joinPath(dirname(file), inc.target), seen);
		return seen;
	}
	let best: { file: string; reach: number } | null = null;
	for (const file of Object.keys(outlines)) {
		const seen = reach(file, new Set());
		if (seen.size > 1 && seen.has(pathKey(normalizePath(open))) && seen.size > (best?.reach ?? 0)) best = { file, reach: seen.size };
	}
	return best?.file ?? null;
}

/**
 * visual mode lists headings only, and the open file's take the visual editor's positions and words, in order.
 * null when the two do not line up, a heading just typed that the source has not caught up with
 */
export function withVisualHeadings(items: TocItem[], visual: TocItem[]): TocItem[] | null {
	const headings = items.filter((i) => !i.kind || i.kind === 'heading');
	if (headings.filter((i) => !i.file).length !== visual.length) return null;
	let k = 0;
	return headings.map((i) => (i.file ? i : { ...i, pos: visual[k].pos, text: visual[k++].text }));
}
