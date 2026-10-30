import type { TocItem } from './tocStore';
import type { SyntaxNode } from '@lezer/common';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import { callsIn, type CallArgument, type CommandCall, type CommandReadings } from '$lib/languages/latex/knowledge/calls/commandCalls';
import type { Argument } from '$lib/languages/latex/knowledge/types';
import { commonRegistry } from '$lib/languages/latex/knowledge/registries/registries';
import { codeOnly } from '$lib/languages/latex/texCode';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { environmentName } from '$lib/languages/latex/syntax/treeMode';
import { readEnvironment } from '$lib/languages/latex/parser/tree/walk/treeEnvironment';
import { texIncludesIn } from '$lib/workspace/document/texIncludes';
import { dirname, pathKey } from '$lib/workspace/fileSystem';
import { withCompiledNumbers, type CompiledEntry } from './compiled/compiledNumbers';

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

const FLOATS = new Set(commonRegistry('floats').map((f) => f.name));

// beamer's frame and \frametitle, stated by the class file, which an outline cannot wait for
const FRAME_ARGUMENTS: Argument[] = [{ kind: 'd<>' }, { kind: 'o' }, { kind: 'o' }, { kind: 'g' }];
const FRAME_TITLE: CommandReadings = {
	frametitle: {
		args: [{ kind: 'd<>' }, { kind: 'o', role: 'text', part: 'short' }, { kind: 'm', role: 'text', part: 'heading' }]
	}
};

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

// a class heading may state no part, so the first bracket is the short title and the first brace the title
function shortOf(call: CommandCall | undefined): CallArgument | undefined {
	return call?.args.find((a) => a.arg.part === 'short' || a.arg.kind === 'o');
}

function titleOf(call: CommandCall | undefined, part: 'caption' | 'heading'): CallArgument | undefined {
	return call?.args.find((a) => a.arg.part === part || a.arg.kind === 'm');
}

function floatName(name: string): string {
	return name.replace(/\*$/, '');
}

function openingName(src: string, env: SyntaxNode): string {
	return env.firstChild ? environmentName(src, env.firstChild) : '';
}

/** parses one file's outline atoms: headings, floats with captions, beamer frames and \input markers. `pos` is a char offset into `src` (LF-normalized, 1:1 with CodeMirror). */
export function parseOutlineRaw(src: string): RawOutlineItem[] {
	const lineStarts = buildLineIndex(src);
	const items: RawOutlineItem[] = [];
	// what TeX skips (a comment, \iffalse, a comment environment) is no part of the outline
	const code = codeOnly(src);
	const calls = callsIn(src, ['text'], FRAME_TITLE);
	function argumentText(arg: CallArgument | undefined): string {
		return arg ? cleanTitle(code.slice(arg.from, arg.to)) : '';
	}
	let headingEnd = 0;
	for (const call of calls) {
		const level = commonFacts(call.command).section;
		const title = titleOf(call, 'heading');
		if (level == null || call.at < headingEnd || !title) continue;
		headingEnd = call.end;
		const short = shortOf(call);
		items.push({
			level,
			text: argumentText(title) || call.command,
			pos: call.at,
			line: lineAt(lineStarts, call.at),
			starred: call.args.some((a) => a.arg.kind === 's'),
			...(short && short.from < short.to ? { short: argumentText(short) } : {})
		});
	}
	const tree = latexTreeOf(src);
	function insideOther(call: CommandCall, env: SyntaxNode): boolean {
		for (let n: SyntaxNode | null = tree.resolveInner(call.at, 1); n && n.from >= env.from && n.to <= env.to; n = n.parent)
			if (n.name === 'Environment' && n.from !== env.from && FLOATS.has(floatName(openingName(src, n)))) return true;
		return false;
	}
	tree.iterate({
		enter(ref) {
			if (ref.name !== 'Environment') return;
			const env = ref.node;
			const name = openingName(src, env);
			function within(call: CommandCall): boolean {
				return call.at > env.from && call.at < env.to;
			}
			if (FLOATS.has(floatName(name))) {
				const cap = calls.find((c) => c.command === 'caption' && within(c) && !insideOther(c, env));
				const short = argumentText(shortOf(cap));
				items.push({
					level: 0,
					text: argumentText(titleOf(cap, 'caption')),
					...(short ? { short } : {}),
					pos: env.from,
					line: lineAt(lineStarts, env.from),
					kind: floatName(name)
				});
			} else if (name === 'frame') {
				// title: an immediate {..} group, else the first \frametitle inside the frame
				const title = readEnvironment(src, env, FRAME_ARGUMENTS).args[3];
				const written = title.present && title.body ? cleanTitle(code.slice(title.body.from, title.body.to)) : '';
				items.push({
					level: 0,
					text:
						written ||
						argumentText(
							titleOf(
								calls.find((c) => c.command === 'frametitle' && within(c)),
								'heading'
							)
						),
					pos: env.from,
					line: lineAt(lineStarts, env.from),
					kind: 'frame'
				});
			}
		}
	});
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
