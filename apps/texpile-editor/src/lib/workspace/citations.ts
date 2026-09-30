// parses the folder's .bib and .bbl files, and the Hayagriva .yml a Typst main names, into the shared references list; read-only
import { box } from '$lib/runes/box.svelte';
import { parseBibtex, parseBblEntries, parseHayagriva, sliceBblBibitems, type BiblatexReference } from '$lib/languages/bib/biblatex';
import { extractDocRefs, type BibItemSlice } from '$lib/languages/latex/parser/labels';
import { typstBibliographyPaths } from '$lib/languages/typst/bibliographyPaths';
import { scanFiles, readTextFile, basename, dirname, joinPath, type TexFile } from './fileSystem';

export type { BiblatexReference };

/** references from the folder's .bib, .bbl and Hayagriva files, also fed to the editor for @-cites. */
export const references = box<BiblatexReference[]>([]);

function parseBibSafe(text: string): BiblatexReference[] {
	try {
		return parseBibtex(text);
	} catch {
		return []; // skip an unparseable file rather than failing the whole load
	}
}

function dedupeByKey(lists: BiblatexReference[][]): BiblatexReference[] {
	const all: BiblatexReference[] = [];
	const seen = new Set<string>();
	for (const list of lists) {
		for (const ref of list) {
			if (ref.key && !seen.has(ref.key)) {
				seen.add(ref.key);
				all.push(ref);
			}
		}
	}
	return all;
}

/** parses several .bib texts into one list, de-duplicated by key (first occurrence wins). */
export function mergeReferences(texts: string[]): BiblatexReference[] {
	return dedupeByKey(texts.map(parseBibSafe));
}

/** references from a .bbl, whichever dialect wrote it: biber emits \entry blocks, classic
 *  bibtex a thebibliography of \bibitem entries (same display heuristics as an embedded one). */
export function bblToReferences(text: string): BiblatexReference[] {
	if (/\\entry\{/.test(text)) return parseBblEntries(text);
	return bibItemsToReferences(sliceBblBibitems(text));
}

/**
 * Turns \bibitem slices into loose references so @-citations work without a .bib file.
 * Only key is reliable; author/title/year are display heuristics over the free text.
 */
export function bibItemsToReferences(items: BibItemSlice[]): BiblatexReference[] {
	const out: BiblatexReference[] = [];
	for (const item of items) {
		const { key } = item;
		// display cleanup only, the raw slice stays untouched
		const body = item.body.replace(/\s+/g, ' ').replace(/[{}]/g, '').replace(/~/g, ' ').replace(/\\&/g, '&').trim();
		const ref: BiblatexReference = { key, entrytype: 'misc', fromBibitem: true, raw: `\\bibitem{${key}} ${item.body.trim()}` };
		const titleM = body.match(/``(.+?)''/) ?? body.match(/[“"](.+?)[”"]/);
		if (titleM) {
			ref.title = titleM[1].trim().replace(/[,.]$/, '');
			const before = body.slice(0, titleM.index).replace(/[,\s]+$/, '');
			if (before) ref.author = before;
		} else {
			// no quoted title (books etc.): treat "Name, Rest of citation" as author, title
			const comma = body.indexOf(',');
			if (comma > 0) {
				ref.author = body.slice(0, comma).trim();
				const rest = body
					.slice(comma + 1)
					.trim()
					.replace(/\.$/, '');
				if (rest) ref.title = rest.length > 90 ? `${rest.slice(0, 90)}…` : rest;
			} else if (body) {
				ref.title = body.length > 90 ? `${body.slice(0, 90)}…` : body;
			}
		}
		const years = body.match(/\b(?:1[89]|20)\d{2}\b/g);
		if (years?.length) ref.year = years[years.length - 1];
		out.push(ref);
	}
	return out;
}

/**
 * Best-effort \bibitem parse from a .tex (thebibliography). AST-scanned, so a commented or
 * verbatim \bibitem doesn't count. Callers already running extractDocRefs should reuse its result.
 */
export function parseBibItems(tex: string): BiblatexReference[] {
	return bibItemsToReferences(extractDocRefs(tex).bibitems);
}

/** what loadReferences reads through: native fs by default, the workspace provider for a guest
 *  session (whose "files" live in the shared doc, not on this machine's disk). */
export type ReferencesFs = {
	scan(root: string, exts: string[]): Promise<TexFile[]>;
	read(path: string): Promise<string>;
};
const nativeFs: ReferencesFs = { scan: (r, e) => scanFiles(r, e).then((x) => x.files), read: readTextFile };

// stale-load guard: reloads fire on every save and every window focus, and an older scan landing
// after a newer one would publish stale entries
let loadSeq = 0;

function isBblFile(f: TexFile): boolean {
	return /\.bbl$/i.test(f.name);
}
function isYamlFile(f: TexFile): boolean {
	return /\.ya?ml$/i.test(f.name);
}
/** de-dupe order: references.bib, the other .bib and Hayagriva files, then .bbl (generated, so it yields) */
function precedence(f: TexFile): number {
	return f.name.toLowerCase() === 'references.bib' ? 0 : isBblFile(f) ? 2 : 1;
}

/** the references a file holds; a YAML file that is not a Hayagriva bibliography holds none */
function referencesIn(f: TexFile, text: string): BiblatexReference[] {
	if (isBblFile(f)) return bblToReferences(text);
	if (isYamlFile(f)) return parseHayagriva(text) ?? [];
	return parseBibSafe(text);
}

/**
 * The Hayagriva files a Typst main's `#bibliography` names: the only YAML read, where a project's
 * other YAML (CI, data) would be read and parsed on every save and window focus for nothing.
 */
async function declaredHayagriva(root: string, main: string | null, fs: ReferencesFs): Promise<TexFile[]> {
	if (!main || !/\.typ$/i.test(main)) return [];
	const text = await fs.read(main).catch(() => '');
	// Typst reads a path against the file naming it, and a leading / against the project root
	return typstBibliographyPaths(text)
		.filter((p) => /\.ya?ml$/i.test(p))
		.map((p) => {
			const path = p.startsWith('/') ? joinPath(root, p) : joinPath(dirname(main), p);
			return { name: basename(path), path, relPath: p };
		});
}

/** parses all .bib and .bbl files in the folder and the Hayagriva (.yml, Typst's own format) ones a
 *  Typst main names, merged; on key clashes references.bib wins, then the other .bib and Hayagriva
 *  files, then .bbl (a .bbl is generated FROM the .bib, so when both hold a key the editable source
 *  is the truth - .bbl-only keys, arXiv-style, still resolve).
 *  The store is NOT cleared up front: it used to be, and the empty window while the folder
 *  rescanned made every citation chip downgrade to its raw key and snap back - a visible flash
 *  on each save. The old list stays up until the fresh one replaces it in a single set. */
export async function loadReferences(root: string, fs: ReferencesFs = nativeFs, main: string | null = null): Promise<void> {
	const my = ++loadSeq;
	try {
		const files = [...(await fs.scan(root, ['bib', 'bbl'])), ...(await declaredHayagriva(root, main, fs))];
		if (my !== loadSeq) return;
		if (!files.length) {
			references.current = [];
			return;
		}
		const ordered = [...files].sort((a, b) => precedence(a) - precedence(b));
		const lists: BiblatexReference[][] = [];
		for (const f of ordered) {
			try {
				const text = await fs.read(f.path);
				lists.push(referencesIn(f, text));
			} catch {
				/* skip unreadable file */
			}
		}
		if (my !== loadSeq) return;
		references.current = dedupeByKey(lists);
	} catch (e) {
		console.error('Failed to load references:', e);
		if (my === loadSeq) references.current = [];
	}
}
