import type { TocItem } from './tocStore';
import { commandsWith, commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import { callsIn } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { commonRegistry } from '$lib/languages/latex/knowledge/registries/registries';
import { codeOnly } from '$lib/languages/latex/texCode';
import { texIncludesIn } from '$lib/workspace/document/texIncludes';
import { dirname, pathKey } from '$lib/workspace/fileSystem';
import { withCompiledNumbers, type CompiledEntry } from './compiled/compiledNumbers';

// read from the '{' at `open` to its matching '}', returning the inner text and the index past '}'
function readGroup(src: string, open: number): { inner: string; end: number } {
	let depth = 0;
	for (let i = open; i < src.length; i++) {
		const c = src[i];
		if (c === '\\') {
			i++; // skip an escaped char so \{ / \} don't shift the balance
			continue;
		}
		if (c === '{') depth++;
		else if (c === '}' && --depth === 0) return { inner: src.slice(open + 1, i), end: i + 1 };
	}
	return { inner: src.slice(open + 1), end: src.length };
}

// strip inner commands/braces for a readable label: \textbf{Foo} -> Foo, \LaTeX -> ''
function cleanTitle(s: string): string {
	return s
		.replace(/\\[a-zA-Z@]+\*?/g, ' ')
		.replace(/\\\\/g, ' ')
		.replace(/[{}~]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** raw outline atoms: TocItems plus the \input markers merging consumes. `short` is the title in [ ], which the
 *  compile writes in place of the full one */
export type InputMarker = {
	kind: 'input';
	pos: number;
	target: string;
	/** the file names TeX tries, in order, under `dir` */
	names: string[];
	dir: string;
	from: 'main' | 'file';
};

export type RawOutlineItem = (TocItem & { starred?: boolean; short?: string }) | InputMarker;

const FLOATS = [...new Set(commonRegistry('floats').map((f) => f.name))];

const SCAN_RE = new RegExp(
	`\\\\(${commandsWith('section').join('|')})\\*?\\s*(?:\\[([^\\]]*)\\])?\\s*\\{|\\\\begin\\{(${FLOATS.join('|')})\\*?\\}|\\\\begin\\{frame\\}`,
	'g'
);

// one newline index + binary search per parse (a slice+split per item is O(file) each,
// quadratic across a big outline)
function buildLineIndex(src: string): number[] {
	const starts = [0];
	for (let i = src.indexOf('\n'); i !== -1; i = src.indexOf('\n', i + 1)) starts.push(i + 1);
	return starts;
}

function lineAt(starts: number[], pos: number): number {
	let lo = 0;
	let hi = starts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (starts[mid] <= pos) lo = mid;
		else hi = mid - 1;
	}
	return lo + 1;
}

/** parses one file's outline atoms: headings, floats with captions, beamer frames and \input markers. `pos` is a char offset into `src` (LF-normalized, 1:1 with CodeMirror). */
export function parseOutlineRaw(src: string): RawOutlineItem[] {
	const lineStarts = buildLineIndex(src);
	const items: RawOutlineItem[] = [];
	// what TeX skips (a comment, \iffalse, a comment environment) is no part of the outline
	const code = codeOnly(src);
	SCAN_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = SCAN_RE.exec(src))) {
		if (code[m.index] !== src[m.index]) continue;
		if (m[1]) {
			const braceOpen = SCAN_RE.lastIndex - 1;
			const { inner, end } = readGroup(src, braceOpen);
			items.push({
				level: commonFacts(m[1]).section!,
				text: cleanTitle(inner) || m[1],
				pos: m.index,
				line: lineAt(lineStarts, m.index),
				starred: /\*\s*(?:\[[^\]]*\])?\s*\{$/.test(m[0]),
				...(m[2] ? { short: cleanTitle(m[2]) } : {})
			});
			SCAN_RE.lastIndex = end; // resume past the title so braces inside it don't re-trigger
		} else if (m[3]) {
			const envName = m[3];
			const bodyEnd = src.indexOf(`\\end{${envName}`, SCAN_RE.lastIndex);
			const body = code.slice(SCAN_RE.lastIndex, bodyEnd === -1 ? SCAN_RE.lastIndex + 4000 : bodyEnd);
			const cap = callsIn(body, ['text']).find((c) => c.command === 'caption');
			function partText(part: 'caption' | 'short'): string {
				const a = cap?.args.find((x) => x.arg.part === part);
				return a ? cleanTitle(body.slice(a.from, a.to)) : '';
			}
			const caption = partText('caption');
			const short = partText('short');
			items.push({
				level: 0,
				text: caption,
				...(short ? { short } : {}),
				pos: m.index,
				line: lineAt(lineStarts, m.index),
				kind: envName
			});
		} else if (m[0].startsWith('\\begin{frame}')) {
			// title: an immediate {..} group, else the first \frametitle inside the frame
			let title = '';
			let after = SCAN_RE.lastIndex;
			while (src[after] === '[') after = src.indexOf(']', after) + 1 || after + 1;
			if (src[after] === '{') title = cleanTitle(readGroup(src, after).inner);
			if (!title) {
				const frameEnd = src.indexOf('\\end{frame}', SCAN_RE.lastIndex);
				const body = src.slice(SCAN_RE.lastIndex, frameEnd === -1 ? SCAN_RE.lastIndex + 4000 : frameEnd);
				const ft = /\\frametitle\s*\{/.exec(body);
				if (ft) title = cleanTitle(readGroup(body, ft.index + ft[0].length - 1).inner);
			}
			items.push({
				level: 0,
				text: title,
				pos: m.index,
				line: lineAt(lineStarts, m.index),
				kind: 'frame'
			});
		}
	}
	for (const include of texIncludesIn(code))
		items.push({ kind: 'input', pos: include.at, target: include.name, names: include.names, dir: include.under, from: include.from });
	return items.sort((a, b) => a.pos - b.pos);
}

function isMarker(i: RawOutlineItem): i is Exclude<RawOutlineItem, TocItem> {
	return i.kind === 'input';
}

function isHeading(item: RawOutlineItem): item is TocItem & { starred?: boolean; short?: string } {
	return !isMarker(item) && !item.kind;
}

/** nests the paper from its highest heading, so a book's chapters and an article's sections both sit at the left,
 *  and gives each entry the number the last compile printed for it (none before a compile). Drops markers */
export function numberOutline(items: RawOutlineItem[], compiled: CompiledEntry[] = []): TocItem[] {
	const depths = items.filter(isHeading).map((i) => i.level);
	const shift = depths.length ? Math.min(...depths) - 1 : 0;
	let level = 1;
	const nested: (TocItem & { short?: string })[] = [];
	for (const item of items) {
		if (isMarker(item)) continue;
		const { starred: _starred, ...entry } = item as TocItem & { starred?: boolean; short?: string };
		entry.level = isHeading(item) ? (level = entry.level - shift) : Math.min(6, level + 1);
		nested.push(entry);
	}
	return withCompiledNumbers(nested, compiled);
}

/** single-file outline: parse + number (the pre-merge behavior every existing caller expects). */
export function latexHeadings(src: string, compiled: CompiledEntry[] = []): TocItem[] {
	return numberOutline(parseOutlineRaw(src), compiled);
}

/**
 * project outline: the active buffer's atoms with \input markers spliced from pre-scanned
 * fragment outlines (cycle-guarded), then numbered as one document. fragment entries keep their
 * `file` so the panel can route the jump.
 */
export function assembleProjectOutline(
	activeRaw: RawOutlineItem[],
	activeFile: string | null,
	activeDir: string | null,
	root: string | null,
	outlines: Record<string, RawOutlineItem[]>,
	compiled: CompiledEntry[] = []
): TocItem[] {
	return assembleOutline(activeRaw, activeFile, activeDir, root, outlines, activeFile, compiled).items;
}

/** the outline from `rootFile` down its \input chain; entries of every file but `own` carry their file, and
 *  `files` is every file the chain reached */
export function assembleOutline(
	rootRaw: RawOutlineItem[],
	rootFile: string | null,
	rootDir: string | null,
	root: string | null,
	outlines: Record<string, RawOutlineItem[]>,
	own: string | null,
	compiled: CompiledEntry[] = []
): { items: TocItem[]; files: string[] } {
	const byNorm = new Map<string, { file: string; items: RawOutlineItem[] }>();
	for (const [file, items] of Object.entries(outlines)) byNorm.set(pathKey(file), { file, items });

	function resolve(baseDir: string | null, marker: InputMarker): { file: string; items: RawOutlineItem[] } | null {
		const dir = marker.dir.replace(/\\/g, '/').replace(/\/+$/, '');
		// an empty folder is a guest's top level, whose paths are relative
		for (const base of marker.from === 'file' ? [baseDir] : [baseDir, root]) {
			if (base === null) continue;
			for (const name of marker.names) {
				const path = [base.replace(/\\/g, '/'), dir, name.replace(/\\/g, '/')].filter(Boolean).join('/');
				const hit = byNorm.get(pathKey(path));
				if (hit) return hit;
			}
		}
		return null;
	}

	const ownKey = own ? pathKey(own) : null;
	const seen = new Set<string>(rootFile ? [pathKey(rootFile)] : []);
	const files: string[] = rootFile ? [rootFile] : [];
	function splice(items: RawOutlineItem[], baseDir: string | null, file: string | null, depth: number): RawOutlineItem[] {
		const tag = file && pathKey(file) !== ownKey ? file : null;
		const out: RawOutlineItem[] = [];
		for (const item of items) {
			if (isMarker(item) && depth < 6) {
				const child = resolve(baseDir, item);
				if (child && !seen.has(pathKey(child.file))) {
					seen.add(pathKey(child.file));
					files.push(child.file);
					out.push(...splice(child.items, dirname(child.file), child.file, depth + 1));
				}
				continue;
			}
			out.push(isMarker(item) || tag == null ? item : { ...item, file: tag });
		}
		return out;
	}

	return { items: numberOutline(splice(rootRaw, rootDir, rootFile, 0), compiled), files };
}
