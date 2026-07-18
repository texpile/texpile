import type { TocItem } from './tocStore';

// mirror the parser's section-level mapping (converter.ts) so the source outline nests the same
// way the visual one does
const HEADING_LEVEL: Record<string, number> = {
	part: 1,
	chapter: 1,
	section: 1,
	subsection: 2,
	subsubsection: 3,
	paragraph: 4,
	subparagraph: 5
};

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

// true if `i` sits after an unescaped % on its own line (a commented-out heading)
function inComment(src: string, i: number): boolean {
	for (let j = src.lastIndexOf('\n', i - 1) + 1; j < i; j++) {
		if (src[j] === '\\') j++;
		else if (src[j] === '%') return true;
	}
	return false;
}

/** raw outline atoms: TocItems plus the structural markers numbering/merging consume. */
export type RawOutlineItem =
	| (TocItem & { starred?: boolean })
	| { kind: 'input'; pos: number; target: string }
	| { kind: 'appendix'; pos: number };

const SCAN_RE =
	/\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]]*\])?\s*\{|\\begin\{(figure|table)\*?\}|\\begin\{frame\}|\\appendix\b|\\(?:input|include|subfile)\s*\{([^}]+)\}/g;

const lineOf = (src: string, pos: number) => src.slice(0, pos).split('\n').length;

/** parses one file's outline atoms: headings, floats with captions, beamer frames, \appendix and
 *  \input markers. `pos` is a char offset into `src` (LF-normalized, 1:1 with CodeMirror). */
export function parseOutlineRaw(src: string): RawOutlineItem[] {
	const items: RawOutlineItem[] = [];
	let lastHeadingLevel = 0;
	SCAN_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = SCAN_RE.exec(src))) {
		if (inComment(src, m.index)) continue;
		if (m[1]) {
			const braceOpen = SCAN_RE.lastIndex - 1;
			const { inner, end } = readGroup(src, braceOpen);
			const level = HEADING_LEVEL[m[1]] ?? 1;
			lastHeadingLevel = level;
			items.push({
				level,
				text: cleanTitle(inner) || m[1],
				pos: m.index,
				line: lineOf(src, m.index),
				starred: /\*\s*(?:\[[^\]]*\])?\s*\{$/.test(m[0])
			});
			SCAN_RE.lastIndex = end; // resume past the title so braces inside it don't re-trigger
		} else if (m[2]) {
			const envName = m[2];
			const bodyEnd = src.indexOf(`\\end{${envName}`, SCAN_RE.lastIndex);
			const body = src.slice(SCAN_RE.lastIndex, bodyEnd === -1 ? SCAN_RE.lastIndex + 4000 : bodyEnd);
			const cap = /\\caption\s*(?:\[[^\]]*\])?\s*\{/.exec(body);
			const caption = cap ? cleanTitle(readGroup(body, cap.index + cap[0].length - 1).inner) : '';
			items.push({
				level: Math.min(6, lastHeadingLevel + 1),
				text: caption,
				pos: m.index,
				line: lineOf(src, m.index),
				kind: envName as 'figure' | 'table'
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
				level: Math.min(6, lastHeadingLevel + 1),
				text: title,
				pos: m.index,
				line: lineOf(src, m.index),
				kind: 'frame'
			});
		} else if (m[0] === '\\appendix') {
			items.push({ kind: 'appendix', pos: m.index });
		} else if (m[3]) {
			items.push({ kind: 'input', pos: m.index, target: m[3].trim() });
		}
	}
	return items;
}

const isMarker = (i: RawOutlineItem): i is Exclude<RawOutlineItem, TocItem> => i.kind === 'input' || i.kind === 'appendix';

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** numbers headings (1.2.3, appendix A/B), figures and tables (own counters); drops markers. */
export function numberOutline(items: RawOutlineItem[]): TocItem[] {
	const counters = [0, 0, 0, 0, 0, 0, 0];
	let appendix = false;
	let fig = 0;
	let tab = 0;
	const out: TocItem[] = [];
	for (const item of items) {
		if (isMarker(item)) {
			if (item.kind === 'appendix') {
				appendix = true;
				counters[1] = 0;
			}
			continue;
		}
		const { starred, ...entry } = item as TocItem & { starred?: boolean };
		if (entry.kind === 'figure') {
			entry.number = String(++fig);
		} else if (entry.kind === 'table') {
			entry.number = String(++tab);
		} else if (entry.kind !== 'frame' && !starred && entry.level <= 3) {
			counters[entry.level]++;
			for (let l = entry.level + 1; l < counters.length; l++) counters[l] = 0;
			const parts: string[] = [];
			for (let l = 1; l <= entry.level; l++)
				parts.push(l === 1 && appendix ? (letters[(counters[1] - 1) % 26] ?? String(counters[1])) : String(counters[l]));
			entry.number = parts.join('.');
		}
		out.push(entry);
	}
	return out;
}

/** single-file outline: parse + number (the pre-merge behavior every existing caller expects). */
export function latexHeadings(src: string): TocItem[] {
	return numberOutline(parseOutlineRaw(src));
}

const normPath = (p: string) => p.replace(/\\/g, '/').toLowerCase();

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
	outlines: Record<string, RawOutlineItem[]>
): TocItem[] {
	const byNorm = new Map<string, { file: string; items: RawOutlineItem[] }>();
	for (const [file, items] of Object.entries(outlines)) byNorm.set(normPath(file), { file, items });

	const resolve = (baseDir: string | null, target: string): { file: string; items: RawOutlineItem[] } | null => {
		const cand = target.replace(/\\/g, '/');
		const names = /\.[a-z]+$/i.test(cand) ? [cand] : [cand + '.tex', cand];
		for (const base of [baseDir, root]) {
			if (!base) continue;
			for (const name of names) {
				const hit = byNorm.get(normPath(base.replace(/\\/g, '/') + '/' + name));
				if (hit) return hit;
			}
		}
		return null;
	};

	const seen = new Set<string>(activeFile ? [normPath(activeFile)] : []);
	const splice = (items: RawOutlineItem[], baseDir: string | null, file: string | null, depth: number): RawOutlineItem[] => {
		const out: RawOutlineItem[] = [];
		for (const item of items) {
			if (item.kind === 'input' && depth < 6) {
				const child = resolve(baseDir, item.target);
				if (child && !seen.has(normPath(child.file))) {
					seen.add(normPath(child.file));
					const childDir = child.file.replace(/\\/g, '/').replace(/\/[^/]*$/, '');
					out.push(...splice(child.items, childDir, child.file, depth + 1));
				}
				continue;
			}
			out.push(isMarker(item) || file == null ? item : { ...item, file });
		}
		return out;
	};

	return numberOutline(splice(activeRaw, activeDir, null, 0));
}
