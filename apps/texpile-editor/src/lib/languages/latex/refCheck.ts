// label, citation and file checks while typing; only what is certain, the rest is left to the compile
import { basename, dirname, joinPath, normalizePath, samePath } from '$lib/workspace/fileSystem';
import { codeOnly } from './texCode';

export type RefProblem =
	/** `elsewhere` is the other file that defines it, or null when this file does twice */
	| { kind: 'label-twice'; name: string; at: number; elsewhere: string | null }
	| { kind: 'cite-unknown'; name: string; at: number }
	| { kind: 'file-missing'; name: string; at: number; what: 'graphic' | 'input' | 'bibliography' };

/** what the document's other files hold, as on disk */
export type DocumentFacts = {
	/** each label the other files define, and one file that defines it */
	labels: Map<string, string>;
	/** every key the bibliography answers, or null when that cannot be known */
	citeKeys: Set<string> | null;
	graphicsPaths: string[];
	/** bibliography files the TeX installation has, lowercased (ieeeabrv.bib) */
	texBibs: Set<string>;
};

export type RefCheckContext = {
	path: string;
	/** the file TeX runs on (the open one when it is a document itself), or null when not known */
	main: string | null;
	root: string;
	/** null for a file outside any known document: only what the file shows on its own is checked */
	facts: DocumentFacts | null;
	/** whether a file is in the project; null when that cannot be told (outside the folder) */
	exists: (path: string) => boolean | null;
	/** keys the project's .bib and .bbl files hold, whatever the document declares */
	knownKeys: ReadonlySet<string>;
	/** the compile's output folder, from the main file's folder ('.' for none) */
	outDir?: string;
};

// what graphicx tries for a name without an extension
const GRAPHIC_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.eps', '.ps', '.mps', '.jbig2', '.jb2', '.PDF', '.PNG', '.JPG', '.JPEG'];

/** a name that is only known once a macro expands, or a macro's own argument */
function unresolved(name: string): boolean {
	return !name.trim() || /[\\#]/.test(name);
}

const LABEL = /\\label\s*\{([^{}]*)\}/g;
const CITE = /\\([A-Za-z]*[Cc]ite[A-Za-z]*|bibentry)\*?(?:\s*\[[^\]]*\])*\s*((?:\{[^{}]*\}(?:\s*\[[^\]]*\])*\s*)+)/g;
const BIBITEM = /\\bibitem\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}/g;
const GRAPHIC = /\\includegraphics\*?\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}/g;
const INPUT = /\\(input|include)\s*\{([^{}]*)\}/g;
const BIBLIOGRAPHY = /\\bibliography\s*\{([^{}]*)\}/g;
const ADDBIBRESOURCE = /\\addbibresource\s*(\[[^\]]*\])?\s*\{([^{}]*)\}/g;
const GRAPHICSPATH = /\\graphicspath\s*\{((?:\s*\{[^{}]*\})*)\s*\}/g;
const BIB_ENTRY = /@[a-zA-Z]+\s*\{\s*([^\s,{}]+)\s*,/g;
// \...cite... commands that take no key, and ones whose later arguments are text
const CITE_NOT_KEYS = new Set(['setcitestyle', 'citestyle', 'citetext']);
const CITE_FIRST_KEYS = new Set(['defcitealias', 'citefield', 'citelist', 'citename', 'citeurl']);

function searchDirs(ctx: RefCheckContext): string[] {
	const dirs = [ctx.main ? dirname(ctx.main) : null, dirname(ctx.path), ctx.root].filter((d): d is string => !!d);
	return dirs.filter((d, i) => dirs.indexOf(d) === i);
}

/** whether any candidate is there: true, false, or null when one of them cannot be told */
function found(ctx: RefCheckContext, candidates: string[]): boolean | null {
	let unknown = false;
	for (const c of candidates) {
		const hit = ctx.exists(normalizePath(c));
		if (hit) return true;
		if (hit === null) unknown = true;
	}
	return unknown ? null : false;
}

function nameAt(m: RegExpMatchArray, name: string): number {
	return (m.index ?? 0) + m[0].lastIndexOf(name);
}

export function graphicsPathsIn(tex: string): string[] {
	const out: string[] = [];
	for (const m of codeOnly(tex).matchAll(GRAPHICSPATH))
		for (const p of m[1].matchAll(/\{([^{}]*)\}/g)) if (p[1].trim()) out.push(p[1].trim());
	return out;
}

export function checkRefs(text: string, ctx: RefCheckContext): RefProblem[] {
	const code = codeOnly(text);
	const problems: RefProblem[] = [];

	const labels = [...code.matchAll(LABEL)]
		.map((m) => ({ name: m[1].trim(), at: (m.index ?? 0) + m[0].indexOf('{') + 1 + m[1].indexOf(m[1].trim()) }))
		.filter((l) => !unresolved(l.name));
	const counts = new Map<string, number>();
	for (const l of labels) counts.set(l.name, (counts.get(l.name) ?? 0) + 1);
	for (const l of labels) {
		if ((counts.get(l.name) ?? 0) > 1) problems.push({ kind: 'label-twice', name: l.name, at: l.at, elsewhere: null });
		else {
			const other = ctx.facts?.labels.get(l.name);
			if (other) problems.push({ kind: 'label-twice', name: l.name, at: l.at, elsewhere: other });
		}
	}

	if (ctx.facts?.citeKeys) {
		const known = new Set([...ctx.facts.citeKeys, ...ctx.knownKeys]);
		for (const m of code.matchAll(BIBITEM)) known.add(m[1].trim());
		for (const m of code.matchAll(CITE)) {
			if (CITE_NOT_KEYS.has(m[1])) continue;
			const groupsAt = (m.index ?? 0) + m[0].length - m[2].length;
			const groups = [...m[2].matchAll(/\{([^{}]*)\}/g)];
			for (const g of CITE_FIRST_KEYS.has(m[1]) ? groups.slice(0, 1) : groups) {
				let offset = groupsAt + (g.index ?? 0) + 1;
				for (const part of g[1].split(',')) {
					const key = part.trim();
					if (key && key !== '*' && !unresolved(key) && !known.has(key))
						problems.push({ kind: 'cite-unknown', name: key, at: offset + part.indexOf(key) });
					offset += part.length + 1;
				}
			}
		}
	}

	// where TeX searches depends on the file it runs on
	if (!ctx.main) return problems.sort((a, b) => a.at - b.at);
	const dirs = searchDirs(ctx);
	const graphicDirs = [...new Set(['', ...(ctx.facts?.graphicsPaths ?? []), ...graphicsPathsIn(text)])];

	for (const m of code.matchAll(GRAPHIC)) {
		const name = m[1].trim();
		if (unresolved(name)) continue;
		const files = /\.[A-Za-z0-9]+$/.test(name) ? [name] : GRAPHIC_EXTS.map((e) => name + e);
		const candidates = dirs.flatMap((d) => graphicDirs.flatMap((g) => files.map((f) => joinPath(joinPath(d, g), f))));
		if (found(ctx, candidates) === false) problems.push({ kind: 'file-missing', name, at: nameAt(m, m[1]), what: 'graphic' });
	}

	// a main file's preamble \input reads from the installation as often as from the project
	const bodyFrom = samePath(ctx.main, ctx.path) ? (/\\begin\s*\{document\}/.exec(code)?.index ?? 0) : 0;
	for (const m of code.matchAll(INPUT)) {
		const name = m[2].trim();
		if (unresolved(name) || (m.index ?? 0) < bodyFrom) continue;
		// TeX tries the name with .tex first, then as written
		const files = /\.[A-Za-z0-9]+$/.test(name) ? [name, `${name}.tex`] : [`${name}.tex`, name];
		if (
			found(
				ctx,
				dirs.flatMap((d) => files.map((f) => joinPath(d, f)))
			) === false
		)
			problems.push({ kind: 'file-missing', name, at: nameAt(m, m[2]), what: 'input' });
	}

	// an arXiv-style project ships the main file's .bbl and no .bib: it builds without one
	const bblPath = ctx.main.replace(/\.[^./\\]*$/, '') + '.bbl';
	const inOut = joinPath(joinPath(dirname(ctx.main), ctx.outDir ?? '.'), basename(bblPath));
	const bbl = ctx.exists(normalizePath(bblPath)) || ctx.exists(normalizePath(inOut));
	const texBibs = ctx.facts?.texBibs;
	function texBib(file: string): boolean {
		return !!texBibs?.has(basename(file).toLowerCase());
	}
	for (const m of bbl ? [] : code.matchAll(BIBLIOGRAPHY)) {
		let offset = (m.index ?? 0) + m[0].indexOf('{') + 1;
		for (const part of m[1].split(',')) {
			const name = part.trim();
			if (name && !unresolved(name)) {
				const file = /\.bib$/i.test(name) ? name : `${name}.bib`;
				if (
					!texBib(file) &&
					found(
						ctx,
						dirs.map((d) => joinPath(d, file))
					) === false
				)
					problems.push({ kind: 'file-missing', name, at: offset + part.indexOf(name), what: 'bibliography' });
			}
			offset += part.length + 1;
		}
	}
	for (const m of code.matchAll(ADDBIBRESOURCE)) {
		const name = m[2].trim();
		if (unresolved(name) || /remote/.test(m[1] ?? '') || /:\/\//.test(name) || texBib(name)) continue;
		if (
			found(
				ctx,
				dirs.map((d) => joinPath(d, name))
			) === false
		)
			problems.push({ kind: 'file-missing', name, at: nameAt(m, m[2]), what: 'bibliography' });
	}
	return problems.sort((a, b) => a.at - b.at);
}

/** `remote` also covers a name only a macro knows */
export function bibliographiesIn(tex: string): { name: string; remote: boolean }[] {
	const code = codeOnly(tex);
	const out: { name: string; remote: boolean }[] = [];
	for (const m of code.matchAll(BIBLIOGRAPHY))
		for (const part of m[1].split(',')) {
			const name = part.trim();
			if (name) out.push({ name: /\.bib$/i.test(name) ? name : `${name}.bib`, remote: unresolved(name) });
		}
	for (const m of code.matchAll(ADDBIBRESOURCE)) {
		const name = m[2].trim();
		out.push({ name, remote: unresolved(name) || /remote/.test(m[1] ?? '') || /:\/\//.test(name) });
	}
	return out;
}

/** `files` as read from disk, the open one among them or not */
export async function documentFacts(
	files: readonly { path: string; text: string }[],
	openPath: string,
	main: string,
	root: string,
	read: (path: string) => Promise<string>,
	/** a bibliography file from the TeX installation, by name; null when it has none */
	readTexBib: (name: string) => Promise<string | null> = async () => null
): Promise<DocumentFacts> {
	const labels = new Map<string, string>();
	const texBibs = new Set<string>();
	const graphicsPaths: string[] = [];
	const keys = new Set<string>();
	const sources: { name: string; remote: boolean; from: string }[] = [];
	let thebibliography = false;
	for (const f of files) {
		const code = codeOnly(f.text);
		graphicsPaths.push(...graphicsPathsIn(f.text));
		sources.push(...bibliographiesIn(f.text).map((b) => ({ ...b, from: f.path })));
		for (const m of code.matchAll(BIBITEM)) keys.add(m[1].trim());
		if (/\\begin\{thebibliography\}/.test(code)) thebibliography = true;
		if (samePath(f.path, openPath)) continue;
		for (const m of code.matchAll(LABEL)) {
			const name = m[1].trim();
			if (!unresolved(name) && !labels.has(name)) labels.set(name, f.path);
		}
	}

	let known = sources.length > 0 || thebibliography;
	for (const s of sources) {
		if (s.remote) {
			known = false;
			continue;
		}
		const tries = [dirname(main), dirname(s.from), root].map((d) => joinPath(d, s.name));
		let text: string | null = null;
		for (const t of tries) {
			try {
				text = await read(t);
				break;
			} catch {
				/* the next place */
			}
		}
		// a bare name TeX finds in the installation (IEEEabrv, the journal abbreviations)
		if (text === null && !/[\\/]/.test(s.name)) {
			text = await readTexBib(s.name).catch(() => null);
			if (text !== null) texBibs.add(basename(s.name).toLowerCase());
		}
		if (text === null) known = false;
		else for (const m of text.matchAll(BIB_ENTRY)) keys.add(m[1]);
	}
	return { labels, citeKeys: known ? keys : null, graphicsPaths, texBibs };
}
