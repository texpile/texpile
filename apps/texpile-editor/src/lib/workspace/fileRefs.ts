// One file-reference surface for all three dialects, behind a dispatch on the referring file's
// extension. Each dialect contributes only a COLLECTOR (its own parser finds the path literals
// and their exact spans); matching, prefix preservation and the splice are shared from here, so
// "does this point at the moved file" is answered the same way everywhere.
import { collectLatexFileRefs } from '$lib/languages/latex/parser/filerefs';
import { collectTypstFileRefs } from '$lib/languages/typst/filerefs';
import { collectMarkdownFileRefs } from '$lib/languages/markdown/filerefs';
import type { Argument } from '$lib/languages/latex/knowledge/types';
import { rolesOf } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { inDir, relativeTo, texRefPointsAt, texRefRender } from './texFileRefs';

/** the argument a LaTeX name sits in, and the folder an \import-style call puts it under */
export type TexFileRef = { arg: Argument; under: string };

/** a path literal in some source file: the span holding the path, and the path as written */
export type FileRef = {
	innerStart: number;
	innerEnd: number;
	current: string;
	tex?: TexFileRef;
};

export type RefDialect = 'tex' | 'typ' | 'md';

/** where names are read from, root-relative: `folder` its own or, for LaTeX, the one TeX runs in */
export type RefPlace = { folder: string; graphicDirs: readonly string[] };

const AT_ROOT: RefPlace = { folder: '', graphicDirs: [] };

/** extensions worth scanning for references, and the dialect each is read as */
const BY_EXT: Record<string, RefDialect> = { tex: 'tex', typ: 'typ', md: 'md' };

export const REF_SCAN_EXTS = Object.keys(BY_EXT);

export function refDialectOf(path: string): RefDialect | null {
	const ext = /\.([^./\\]+)$/.exec(path)?.[1]?.toLowerCase();
	return ext ? (BY_EXT[ext] ?? null) : null;
}

const COLLECT: Record<RefDialect, (src: string) => FileRef[]> = {
	tex: collectLatexFileRefs,
	typ: collectTypstFileRefs,
	md: collectMarkdownFileRefs
};

/** A written reference carries a prefix that is addressing, not path: `./` everywhere, and in
 *  typst a leading `/` meaning "from the project root". Both survive a rewrite untouched. */
function splitPrefix(current: string, dialect: RefDialect): { prefix: string; path: string } {
	if (current.startsWith('./')) return { prefix: './', path: current.slice(2) };
	if (dialect === 'typ' && current.startsWith('/')) return { prefix: '/', path: current.slice(1) };
	return { prefix: '', path: current };
}

/** markdown destinations may percent-encode what a path spells literally */
function decoded(path: string): string {
	if (!path.includes('%')) return path;
	try {
		return decodeURIComponent(path);
	} catch {
		return path;
	}
}

function texFolderOf(tex: TexFileRef, path: string, targetRel: string, place: RefPlace): string | null {
	const dirs = rolesOf(tex.arg).includes('graphic') ? ['', ...place.graphicDirs] : [''];
	for (const dir of dirs) {
		const under = inDir(inDir(place.folder, dir), tex.under);
		if (texRefPointsAt({ ...tex, under }, path, targetRel)) return under;
	}
	return null;
}

function pointsAt(ref: FileRef, targetRel: string, dialect: RefDialect, place: RefPlace): boolean {
	const { prefix, path } = splitPrefix(ref.current, dialect);
	if (ref.tex) return texFolderOf(ref.tex, path, targetRel, place) !== null;
	const from = prefix === '/' ? '' : place.folder;
	return inDir(from, path) === targetRel || (dialect === 'md' && inDir(from, decoded(path)) === targetRel);
}

/** how the new path should be WRITTEN in place of this reference */
function render(ref: FileRef, newRel: string, oldRel: string, dialect: RefDialect, place: RefPlace): string {
	const { prefix, path } = splitPrefix(ref.current, dialect);
	if (ref.tex) return prefix + texRefRender({ ...ref.tex, under: texFolderOf(ref.tex, path, oldRel, place) ?? '' }, path, newRel, oldRel);
	const written = prefix === '/' ? newRel : relativeTo(place.folder, newRel);
	// a raw space would end a markdown destination; encode it when the original was not <wrapped>
	// (collectMarkdownFileRefs hands angle-bracketed spans over without their brackets, and the
	// brackets stay in the file, so those tolerate spaces as they are)
	if (dialect === 'md' && written.includes(' ') && !ref.current.includes(' ')) return prefix + written.replaceAll(' ', '%20');
	return prefix + written;
}

function matching(src: string, targetRel: string, dialect: RefDialect, place: RefPlace): FileRef[] {
	return COLLECT[dialect](src).filter((r) => pointsAt(r, targetRel, dialect, place));
}

export function fileRefOffsets(src: string, targetRel: string, dialect: RefDialect, place: RefPlace = AT_ROOT): number[] {
	return matching(src, targetRel, dialect, place).map((r) => r.innerStart);
}

/** How many references in `src` point at `targetRel`. */
export function countFileRefs(src: string, targetRel: string, dialect: RefDialect, place: RefPlace = AT_ROOT): number {
	return matching(src, targetRel, dialect, place).length;
}

/** Repoint every reference to `targetRel` at `newRel`, splicing by source offset so nothing else
 *  in the file - formatting, comments, the blocks around it - is disturbed. */
export function replaceFileRefs(
	src: string,
	targetRel: string,
	newRel: string,
	dialect: RefDialect,
	place: RefPlace = AT_ROOT
): { text: string; count: number } {
	const refs = matching(src, targetRel, dialect, place);
	if (!refs.length) return { text: src, count: 0 };
	let text = src;
	// splice last -> first so earlier offsets stay valid
	for (const r of [...refs].sort((a, b) => b.innerStart - a.innerStart)) {
		text = text.slice(0, r.innerStart) + render(r, newRel, targetRel, dialect, place) + text.slice(r.innerEnd);
	}
	return { text, count: refs.length };
}
