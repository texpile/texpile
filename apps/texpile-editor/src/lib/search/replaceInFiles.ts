// replace across the folder: the rewrite and the walk over the files
import { detectEol, fromLf, samePath, toLf, type Eol } from '$lib/workspace/fileSystem';
import { applyEdits, editsOnRaw, invertEdits, type TextEdit } from '$lib/workspace/edits/textEdits';
import type { EditMode } from '$lib/comments/suggestCompare';

export type ReplaceSpec = {
	query: string;
	replacement: string;
	regex: boolean;
	caseSensitive: boolean;
};

/** the search's matcher as a global regex, or null for an empty query or an invalid pattern */
export function matcher(spec: ReplaceSpec): RegExp | null {
	if (!spec.query) return null;
	const source = spec.regex ? spec.query : spec.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	try {
		return new RegExp(source, spec.caseSensitive ? 'g' : 'gi');
	} catch {
		return null;
	}
}

/** a regex replacement may use $1 and $&; a plain one is literal */
export function replaceInText(text: string, spec: ReplaceSpec): { text: string; count: number } {
	const edits = replaceEdits(text, spec);
	return { text: edits.length ? applyEdits(text, edits) : text, count: edits.length };
}

export function replaceEdits(text: string, spec: ReplaceSpec): TextEdit[] {
	const re = matcher(spec);
	if (!re) return [];
	// replaced within its whole line, so $1, $&, a lookbehind or an anchor read as in the scan
	const one = spec.regex ? new RegExp(re.source, re.flags.replace('g', '') + 'y') : null;
	const edits: TextEdit[] = [];
	let lineStart = 0;
	for (const line of text.split('\n')) {
		re.lastIndex = 0;
		for (const hit of line.matchAll(re)) {
			const at = hit.index;
			let insert = spec.replacement;
			if (one) {
				one.lastIndex = at;
				const replaced = line.replace(one, spec.replacement);
				insert = replaced.slice(at, replaced.length - (line.length - at - hit[0].length));
			}
			edits.push({ from: lineStart + at, to: lineStart + at + hit[0].length, insert });
		}
		lineStart += line.length + 1;
	}
	return edits;
}

export type ReplaceDeps = {
	/** the file with a live buffer (text in LF), or null when none can take an edit */
	open(): { path: string; text: string; eol: Eol } | null;
	/** through its editor, so the change undoes there and suggestion mode sees it; false when refused */
	applyToOpen(before: string, next: string, edits: readonly TextEdit[]): Promise<boolean>;
	/** land any queued save of the open file */
	flush(): Promise<void>;
	read(path: string): Promise<{ text: string; encoding: string }>;
	write(path: string, text: string): Promise<void>;
	encodingError(encoding: string): string | null;
	/** after our own writes: refresh the tree and the references */
	changed(): void;
	/** a closed file is about to change: carry its comments and suggestions along. Resolves the mode it was carried
	 *  in, which `made` hands back to its undo and redo so they go the way it went */
	edited?(path: string, before: string, after: string, edits: TextEdit[], made?: EditMode): Promise<EditMode | void>;
};

// `raw`: a closed file's own bytes on either side, its line endings as they were
type Change = {
	path: string;
	before: string;
	after: string;
	eol: Eol;
	edits: TextEdit[];
	raw?: { before: string; after: string };
	made?: EditMode;
};

export type ReplaceOutcome = {
	files: number;
	matches: number;
	/** files that matched but were left as they were */
	skipped: { path: string; reason: 'encoding' | 'editor' | 'failed' }[];
	/** all or nothing: throws, changing nothing, when a file was edited since */
	undo: (() => Promise<void>) | null;
	redo: (() => Promise<void>) | null;
};

export class ChangedSinceError extends Error {
	constructor(readonly path: string) {
		super(path);
	}
}

/** `spec` may differ by file (a rename follows each language's syntax); null passes a file over */
export async function replaceInFiles(
	paths: readonly string[],
	spec: ReplaceSpec | ((path: string) => ReplaceSpec | null),
	deps: ReplaceDeps
): Promise<ReplaceOutcome> {
	const specFor = typeof spec === 'function' ? spec : () => spec;
	await deps.flush();
	const changes: Change[] = [];
	const skipped: ReplaceOutcome['skipped'] = [];
	let matches = 0;

	for (const path of paths) {
		const fileSpec = specFor(path);
		if (!fileSpec) continue;
		try {
			const open = deps.open();
			if (open && samePath(open.path, path)) {
				const edits = replaceEdits(open.text, fileSpec);
				if (!edits.length) continue;
				const text = applyEdits(open.text, edits);
				if (!(await deps.applyToOpen(open.text, text, edits))) {
					skipped.push({ path, reason: 'editor' });
					continue;
				}
				changes.push({ path, before: open.text, after: text, eol: open.eol, edits });
				matches += edits.length;
				continue;
			}
			const read = await deps.read(path);
			if (deps.encodingError(read.encoding)) {
				skipped.push({ path, reason: 'encoding' });
				continue;
			}
			const eol = detectEol(read.text);
			const before = toLf(read.text);
			const edits = replaceEdits(before, fileSpec);
			if (!edits.length) continue;
			const text = applyEdits(before, edits);
			const raw = { before: read.text, after: applyEdits(read.text, editsOnRaw(read.text, edits, eol)) };
			const made = (await deps.edited?.(path, before, text, edits)) || undefined;
			await deps.write(path, raw.after);
			changes.push({ path, before, after: text, eol, edits, raw, made });
			matches += edits.length;
		} catch {
			skipped.push({ path, reason: 'failed' });
		}
	}
	if (changes.length) {
		// the open file's edit is queued as a save; land it so a search run now reads the new text
		await deps.flush();
		deps.changed();
	}

	return {
		files: changes.length,
		matches,
		skipped,
		undo: changes.length ? () => restore(changes, 'after', 'before', deps) : null,
		redo: changes.length ? () => restore(changes, 'before', 'after', deps) : null
	};
}

/** every file from its `from` text to its `to`, or none when one no longer holds `from` */
async function restore(changes: readonly Change[], from: 'before' | 'after', to: 'before' | 'after', deps: ReplaceDeps): Promise<void> {
	await deps.flush();
	const current = await Promise.all(
		changes.map(async (c) => {
			const open = deps.open();
			if (open && samePath(open.path, c.path)) return { c, open: true, text: open.text };
			const read = await deps.read(c.path);
			return { c, open: false, text: toLf(read.text) };
		})
	);
	const stale = current.find(({ c, text }) => text !== c[from]);
	if (stale) throw new ChangedSinceError(stale.c.path);
	for (const { c, open } of current) {
		const undoing = from === 'after';
		const edits = undoing ? invertEdits(c.before, c.edits) : c.edits;
		if (open) {
			if (!(await deps.applyToOpen(c[from], c[to], edits))) throw new ChangedSinceError(c.path);
			continue;
		}
		await deps.edited?.(c.path, c[from], c[to], edits, c.made);
		await deps.write(c.path, c.raw ? c.raw[to] : fromLf(c[to], c.eol));
	}
	await deps.flush();
	deps.changed();
}
