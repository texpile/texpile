// Where imported citations land, and how they are appended: the pure half of the citation-insert
// flows (Zotero and the personal library). Everything here is text-in/text-out so it can be unit
// tested without Zotero, disk, or an editor.
//
// The target `.bib` is whatever the MAIN file already declares - `\addbibresource` /
// `\bibliography` for LaTeX, `#bibliography(...)` for Typst - because that is the file the
// compile actually reads.
import { parseBibtex, referencesToBib } from '$lib/languages/bib/biblatex';

/**
 * The bib path the main file declares, relative as written (resolution against the main file's
 * folder is the caller's job), or null when it declares none.
 *
 * `\bibliography{a,b}` names keys without extensions and may list several files; the first one
 * is where new entries go. `\addbibresource` includes the extension by convention, but a bare
 * name still gets `.bib` - biblatex assumes the same default.
 */
export function bibPathFromSource(text: string, kind: 'tex' | 'typ'): string | null {
	if (kind === 'typ') {
		// #bibliography("refs.bib") or #bibliography(("a.bib", "b.bib")) - first string wins
		const m = /bibliography\s*\(\s*\(?\s*"([^"\n]+)"/.exec(text);
		return m ? m[1] : null;
	}
	const resource = /\\addbibresource\s*(?:\[[^\]]*\])?\s*\{([^}\n]+)\}/.exec(text);
	if (resource) return withBibExt(resource[1].trim());
	const classic = /\\bibliography\s*\{([^}\n]+)\}/.exec(text);
	if (classic) {
		const first = classic[1].split(',')[0]?.trim();
		return first ? withBibExt(first) : null;
	}
	return null;
}

function withBibExt(path: string): string {
	return /\.[A-Za-z0-9]+$/.test(path) ? path : `${path}.bib`;
}

/**
 * Which Better BibTeX translator matches the project's bibliography stack. `\addbibresource` (or
 * an explicit biblatex load) means biblatex entry types; classic `\bibliography` wants plain
 * BibTeX. Typst reads `.bib` through hayagriva, which understands the biblatex dialect.
 */
export function translatorForSource(text: string, kind: 'tex' | 'typ'): string {
	if (kind === 'typ') return 'Better BibLaTeX';
	return /\\addbibresource\b|\\usepackage\s*(?:\[[^\]]*\])?\s*\{[^}]*\bbiblatex\b[^}]*\}/.test(text) ? 'Better BibLaTeX' : 'Better BibTeX';
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
