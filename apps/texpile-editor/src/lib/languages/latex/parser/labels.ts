// extract \label keys and \bibitem entries via the AST, never regex over raw text (a \label
// inside a comment or verbatim environment must not count). best-effort: parse failures yield
// empty results.
import { parseLatex } from './parser';
import { findMacros, getTextContent } from './ast-utils';
import type { Macro } from '@unified-latex/unified-latex-types';

export type BibItemSlice = {
	key: string;
	/** The entry's free text: source after the `\bibitem[…]{…}` head, up to the next entry. */
	body: string;
};

/** Matches the `\bibitem[label]{key}` head at the start of an entry's source slice. */
const BIBITEM_HEAD = /^\\bibitem\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/;

export function extractDocRefs(latex: string): { labels: string[]; bibitems: BibItemSlice[] } {
	const labels = new Set<string>();
	const bibitems: BibItemSlice[] = [];
	try {
		const ast = parseLatex(latex);
		for (const macro of findMacros(ast, 'label')) {
			const arg = macro.args?.[macro.args.length - 1];
			if (!arg) continue;
			const key = getTextContent(arg.content).trim();
			if (key) labels.add(key);
		}
		// AST positions locate the true \bibitem calls; the inter-item BODY is a plain source
		// slice (free text, sibling nodes, not macro args).
		const items = findMacros(ast, 'bibitem')
			.map((m) => ({ m, start: m.position?.start?.offset }))
			.filter((x): x is { m: Macro; start: number } => typeof x.start === 'number')
			.sort((a, b) => a.start - b.start);
		const seen = new Set<string>();
		for (let i = 0; i < items.length; i++) {
			const { m, start } = items[i];
			const sliceEnd = i + 1 < items.length ? items[i + 1].start : latex.length;
			const slice = latex.slice(start, sliceEnd);
			// key = the last BRACE arg. unified-latex attaches each entry's whole body as an extra
			// mark-less argument (like \item bodies), so a bare "last arg" would be the body.
			// fall back to the head regex when no args attached at all.
			const braceArgs = (m.args ?? []).filter((a) => a.openMark === '{');
			let key = braceArgs.length ? getTextContent(braceArgs[braceArgs.length - 1].content).trim() : '';
			const head = slice.match(BIBITEM_HEAD);
			if (!key && head) key = head[1].trim();
			if (!key || seen.has(key)) continue;
			seen.add(key);
			// body: strip the head; cut at \end{thebibliography} (present only on the last slice).
			let body = head ? slice.slice(head[0].length) : slice;
			const envEnd = body.search(/\\end\s*\{\s*thebibliography\s*\}/);
			if (envEnd >= 0) body = body.slice(0, envEnd);
			bibitems.push({ key, body });
		}
	} catch {
		/* unparseable mid-edit: just return what we have */
	}
	return { labels: [...labels], bibitems };
}

/** \label keys only, for \ref/\cref autocompletion. */
export function extractLabels(latex: string): string[] {
	return extractDocRefs(latex).labels;
}
