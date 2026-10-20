// label, citation and file checks while typing; only what is certain, the rest is left to the compile
import { basename, dirname, joinPath, normalizePath, samePath } from '$lib/workspace/fileSystem';
import { codeOnly } from './texCode';
import { dirOf, fileCallsIn, namesTried, searchDirsIn } from './knowledge/calls/fileCommands';
import type { FileRole } from './knowledge/types';
import { rolesOf } from './knowledge/calls/commandCalls';
import { bibliographyBegin } from './knowledge/environments/bibliographyEnvironment';
import { keysIn } from './knowledge/calls/roleKeys';
import { graphicExtensionsFor } from './knowledge/registries/graphicExtensions';
import { compileEngine } from './intellisense/packages/loadedPackages';
import type { Argument } from './knowledge/types';

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

/** a name that is only known once a macro expands, or a macro's own argument */
function unresolved(name: string): boolean {
	return !name.trim() || /[\\#]/.test(name);
}

const BIB_ENTRY = /@[a-zA-Z]+\s*\{\s*([^\s,{}]+)\s*,/g;

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

const WHAT = { file: 'input', listing: 'input', graphic: 'graphic', bibfile: 'bibliography' } as const;
const CHECKED_ROLES = Object.keys(WHAT) as (keyof typeof WHAT & FileRole)[];
const HAS_EXTENSION = /\.[A-Za-z0-9]+$/;

// a file argument TeX does not load (\includeonly) names files that need not exist
function checkedRole(arg: Argument): (typeof CHECKED_ROLES)[number] | null {
	return CHECKED_ROLES.find((r) => rolesOf(arg).includes(r) && (r !== 'file' || arg.loads)) ?? null;
}

/** the names to look for; the name as written counts too, a miss is only reported when nothing could be meant */
function namesFor(arg: Argument, written: string, role: (typeof CHECKED_ROLES)[number]): string[] {
	if (arg.ext) return [...new Set([...namesTried(arg, written), written])];
	if (role !== 'graphic' || HAS_EXTENSION.test(written)) return [written];
	return (arg.accepts ?? graphicExtensionsFor(compileEngine())).map((e) => written + e);
}

/** a location=remote option, read from the text between the command and its file */
function remoteBib(code: string, call: { at: number; command: string }, firstName: number, name: string): boolean {
	return /remote/.test(code.slice(call.at + call.command.length + 1, firstName)) || /:\/\//.test(name);
}

export function checkRefs(text: string, ctx: RefCheckContext): RefProblem[] {
	const code = codeOnly(text);
	const problems: RefProblem[] = [];

	const labels = keysIn(code, 'label', true).filter((l) => !unresolved(l.key));
	const counts = new Map<string, number>();
	for (const l of labels) counts.set(l.key, (counts.get(l.key) ?? 0) + 1);
	for (const l of labels) {
		if ((counts.get(l.key) ?? 0) > 1) problems.push({ kind: 'label-twice', name: l.key, at: l.at, elsewhere: null });
		else {
			const other = ctx.facts?.labels.get(l.key);
			if (other) problems.push({ kind: 'label-twice', name: l.key, at: l.at, elsewhere: other });
		}
	}

	if (ctx.facts?.citeKeys) {
		const known = new Set([...ctx.facts.citeKeys, ...ctx.knownKeys, ...keysIn(code, 'citekey', true).map((k) => k.key)]);
		for (const k of keysIn(code, 'citekey', false)) {
			if (!k.wildcard && !unresolved(k.key) && !known.has(k.key)) problems.push({ kind: 'cite-unknown', name: k.key, at: k.at });
		}
	}

	// where TeX searches depends on the file it runs on
	if (!ctx.main) return problems.sort((a, b) => a.at - b.at);
	const dirs = searchDirs(ctx);
	const graphicDirs = [...new Set(['', ...(ctx.facts?.graphicsPaths ?? []), ...searchDirsIn(code)])];

	// a main file's preamble \input reads from the installation as often as from the project
	const bodyFrom = samePath(ctx.main, ctx.path) ? (/\\begin\s*\{document\}/.exec(code)?.index ?? 0) : 0;
	// an arXiv-style project ships the main file's .bbl and no .bib: it builds without one
	const bblPath = ctx.main.replace(/\.[^./\\]*$/, '') + '.bbl';
	const inOut = joinPath(joinPath(dirname(ctx.main), ctx.outDir ?? '.'), basename(bblPath));
	const bbl = ctx.exists(normalizePath(bblPath)) || ctx.exists(normalizePath(inOut));
	const texBibs = ctx.facts?.texBibs;
	function texBib(file: string): boolean {
		return !!texBibs?.has(basename(file).toLowerCase());
	}

	for (const call of fileCallsIn(code, CHECKED_ROLES)) {
		for (const a of call.args) {
			const role = checkedRole(a.arg);
			if (!role || (role === 'file' && call.at < bodyFrom) || (role === 'bibfile' && bbl)) continue;
			const under = dirOf(call, a);
			if (under && unresolved(under)) continue;
			const base = (a.arg.from === 'file' ? [dirname(ctx.path)] : dirs).map((d) => (under ? joinPath(d, under) : d));
			for (const v of a.values) {
				if (unresolved(v.value) || (role === 'bibfile' && remoteBib(code, call, a.values[0].at, v.value))) continue;
				const names = namesFor(a.arg, v.value, role);
				if (role === 'bibfile' && names.some(texBib)) continue;
				const candidates = base.flatMap((d) =>
					(role === 'graphic' ? graphicDirs : ['']).flatMap((g) => names.map((n) => joinPath(joinPath(d, g), n)))
				);
				if (found(ctx, candidates) === false) problems.push({ kind: 'file-missing', name: v.value, at: v.at, what: WHAT[role] });
			}
		}
	}
	return problems.sort((a, b) => a.at - b.at);
}

/** `remote` also covers a name only a macro knows */
export function bibliographiesIn(tex: string): { name: string; remote: boolean }[] {
	const code = codeOnly(tex);
	return fileCallsIn(code, ['bibfile']).flatMap((call) =>
		call.args
			.filter((a) => rolesOf(a.arg).includes('bibfile'))
			.flatMap((a) =>
				a.values.map((v) => {
					const ends = !!a.arg.ext && v.value.toLowerCase().endsWith(a.arg.ext.toLowerCase());
					return {
						name: a.arg.ext && !ends ? namesTried(a.arg, v.value)[0] : v.value,
						remote: unresolved(v.value) || remoteBib(code, call, a.values[0].at, v.value)
					};
				})
			)
	);
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
		graphicsPaths.push(...searchDirsIn(code));
		sources.push(...bibliographiesIn(f.text).map((b) => ({ ...b, from: f.path })));
		for (const k of keysIn(code, 'citekey', true)) keys.add(k.key);
		if (bibliographyBegin().test(code)) thebibliography = true;
		if (samePath(f.path, openPath)) continue;
		for (const l of keysIn(code, 'label', true)) if (!unresolved(l.key) && !labels.has(l.key)) labels.set(l.key, f.path);
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
