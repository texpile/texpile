// The Contents of the whole paper around the open file: the main file down its \input chain, numbered as one
// document. The open file's own entries keep positions in its editor; every other file's carry it, to open it there
import type { Node } from 'prosemirror-model';
import type { TocItem } from './tocStore';
import { assembleOutline, parseOutlineRaw, type RawOutlineItem } from './latexHeadings';
import { dirname, joinPath, normalizePath, pathKey, samePath } from '$lib/workspace/fileSystem';
import type { TypstOutline } from '$lib/stores/projectIntel';
import type { CompiledEntry } from './compiled/compiledNumbers';

export type ProjectOutlineInput = {
	main: string;
	open: string;
	/** the open file's text as its editor has it now */
	openSource: string;
	root: string | null;
	/** the other files' outlines, from the project scan */
	outlines: Record<string, RawOutlineItem[]>;
	/** what the last compile numbered, from its .aux */
	compiled?: CompiledEntry[];
};

/** null when there is no paper to place the open file in: the main file is not scanned, or never reaches it */
export function latexProjectOutline(input: ProjectOutlineInput): TocItem[] | null {
	const { main, open, root } = input;
	const openRaw = parseOutlineRaw(input.openSource);
	const outlines = { ...input.outlines, [open]: openRaw };
	const mainRaw = samePath(main, open) ? openRaw : Object.entries(outlines).find(([file]) => samePath(file, main))?.[1];
	if (!mainRaw) return null;
	const { items, files } = assembleOutline(mainRaw, main, dirname(main), root, outlines, open, input.compiled);
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
 * the open file's entries at the visual editor's positions, in order: its headings with their words, its figures and
 * tables where `floats` has as many of each. null when the headings do not line up, a heading just typed that the
 * source has not caught up with
 */
export function withVisualHeadings(items: TocItem[], visual: TocItem[], floats: TocItem[] = []): TocItem[] | null {
	const own = items.filter((i) => !i.file);
	function ofKind(list: TocItem[], kind: TocItem['kind']): TocItem[] {
		return list.filter((i) => (i.kind ?? 'heading') === kind);
	}
	if (ofKind(own, 'heading').length !== visual.length) return null;
	const placed = new Map<TocItem, TocItem>();
	for (const [kind, theirs] of [
		['heading', visual],
		['figure', ofKind(floats, 'figure')],
		['table', ofKind(floats, 'table')]
	] as const) {
		const mine = ofKind(own, kind);
		if (mine.length === theirs.length) mine.forEach((item, k) => placed.set(item, theirs[k]));
	}
	// what the editor has no place for (a frame, a figure it keeps as raw LaTeX) cannot be jumped to from here
	return items.flatMap((i) => {
		if (i.file) return [i];
		const at = placed.get(i);
		return at ? [{ ...i, pos: at.pos, text: i.kind && i.kind !== 'heading' ? i.text : at.text }] : [];
	});
}

/** a LaTeX visual editor's figures and tables, in order, at its positions */
export function visualFloats(doc: Node): TocItem[] {
	const out: TocItem[] = [];
	doc.descendants((node, pos) => {
		if (node.type.name === 'image' && !node.attrs.bareOriginal) out.push({ level: 0, kind: 'figure', text: node.textContent, pos });
		else if (node.type.name === 'table_wrapper') out.push({ level: 0, kind: 'table', text: node.firstChild?.textContent ?? '', pos });
		else return true;
		return false;
	});
	return out;
}
