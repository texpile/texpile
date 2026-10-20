// Where Zotero imports land, and how they are appended: the pure half of the Zotero flow.
//
// The target `.bib` is whatever the MAIN file already declares - `\addbibresource` /
// `\bibliography` for LaTeX, `#bibliography(...)` for Typst - because that is the file the
// compile actually reads. Everything here is text-in/text-out so it can be unit tested without
// Zotero, disk, or an editor.
import { parseBibtex, referencesToBib } from '$lib/languages/bib/biblatex';
import { typstBibliographyPaths } from '$lib/languages/typst/bibliographyPaths';
import { codeOnly } from '$lib/languages/latex/texCode';
import { fileCallsIn, namesTried } from '$lib/languages/latex/knowledge/calls/fileCommands';
import { rolesOf } from '$lib/languages/latex/knowledge/calls/commandCalls';
import type { Argument } from '$lib/languages/latex/knowledge/types';

/**
 * The bib paths the main file declares, in order and relative as written (resolution against the
 * main file's folder is the caller's job); empty when it declares none.
 *
 * `\bibliography{a,b}` names keys without extensions and may list several files, the first of
 * them often a string file from the TeX installation (IEEEabrv). `\addbibresource` includes the
 * extension by convention, but a bare name still gets `.bib` - biblatex assumes the same default.
 *
 * Typst also reads Hayagriva `.yml` files, but what gets appended is BibTeX, so only a `.bib` in
 * the `#bibliography` list counts; a list of `.yml` files alone declares nowhere to write.
 */
export function bibPathsFromSource(text: string, kind: 'tex' | 'typ'): string[] {
	if (kind === 'typ') return typstBibliographyPaths(text).filter(isBibPath);
	const files = bibFilesIn(codeOnly(text));
	const resources = files.filter((f) => f.fullName);
	return (resources.length ? resources : files).map((f) => f.path);
}

// the commands that take the whole file name win over the ones that add the extension
function bibFilesIn(code: string): { fullName: boolean; path: string }[] {
	return fileCallsIn(code, ['bibfile']).flatMap((call) =>
		call.args
			.filter((a) => rolesOf(a.arg).includes('bibfile'))
			.flatMap((a) => a.values.map((v) => ({ fullName: !a.arg.ext, path: withBibExt(a.arg, v.value) })))
	);
}

function withBibExt(arg: Argument, written: string): string {
	if (arg.ext) return namesTried(arg, written)[0];
	const ext = arg.accepts?.[0];
	return ext && !arg.accepts?.some((e) => written.toLowerCase().endsWith(e)) ? written + ext : written;
}

export function isBibPath(path: string): boolean {
	return /\.bib$/i.test(path);
}

/**
 * Which Better BibTeX translator matches the project's bibliography stack. `\addbibresource` (or
 * an explicit biblatex load) means biblatex entry types; classic `\bibliography` wants plain
 * BibTeX. Typst reads `.bib` through hayagriva, which understands the biblatex dialect.
 */
export function translatorForSource(text: string, kind: 'tex' | 'typ'): string {
	if (kind === 'typ') return 'Better BibLaTeX';
	const biblatex = fileCallsIn(codeOnly(text), ['bibfile', 'package']).some((call) =>
		call.args.some((a) => (rolesOf(a.arg).includes('bibfile') ? !a.arg.ext : a.arg.loads && a.values.some((v) => v.value === 'biblatex')))
	);
	return biblatex ? 'Better BibLaTeX' : 'Better BibTeX';
}

export type AppendResult = {
	/** the target file's new content (unchanged when nothing was added) */
	text: string;
	/** keys appended */
	added: string[];
	/** keys skipped because the file already has them */
	skipped: string[];
};

/**
 * Append the incoming entries that the file does not already have, byte-preserving everything
 * that was there. Dedupe is by cite key only - an existing key wins even if the entry differs,
 * because clobbering hand-edits with a re-import is worse than a stale field.
 */
export function appendBibEntries(existing: string, incoming: string): AppendResult {
	const have = new Set(parseBibtex(existing).map((e) => e.key));
	const added: string[] = [];
	const skipped: string[] = [];
	const chunks: string[] = [];
	for (const entry of parseBibtex(incoming)) {
		if (have.has(entry.key)) {
			skipped.push(entry.key);
			continue;
		}
		have.add(entry.key);
		added.push(entry.key);
		chunks.push((entry.raw ?? referencesToBib([entry])).trim());
	}
	if (!chunks.length) return { text: existing, added, skipped };

	// match the file's own line endings; a fresh file gets plain LF
	const eol = existing.includes('\r\n') ? '\r\n' : '\n';
	const body = chunks.join(eol + eol).replace(/\r?\n/g, eol);
	const head = existing.replace(/\s+$/, '');
	return { text: head ? head + eol + eol + body + eol : body + eol, added, skipped };
}

/** the caret text for the picked keys, per dialect */
export function citationTextFor(keys: string[], kind: 'tex' | 'typ'): string {
	return kind === 'typ' ? keys.map((k) => `@${k}`).join(' ') : `\\cite{${keys.join(',')}}`;
}
