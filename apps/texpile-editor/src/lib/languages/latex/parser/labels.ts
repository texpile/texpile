// the \label keys and \bibitem entries of a text, read by the argument roles of the package data
import { codeOnly } from '../texCode';
import { bibliographyEnd } from '../knowledge/environments/bibliographyEnvironment';
import { keysIn } from '../knowledge/calls/roleKeys';

export type BibItemSlice = {
	key: string;
	/** The entry's free text: source after the `\bibitem[…]{…}` head, up to the next entry. */
	body: string;
};

export function extractDocRefs(latex: string): { labels: string[]; bibitems: BibItemSlice[] } {
	const code = codeOnly(latex);
	const labels = new Set(keysIn(code, 'label', true).map((d) => d.key));
	const items = keysIn(code, 'citekey', true).sort((a, b) => a.call.at - b.call.at);
	const bibitems: BibItemSlice[] = [];
	const seen = new Set<string>();
	const listEnd = bibliographyEnd();
	items.forEach((item, i) => {
		if (seen.has(item.key)) return;
		seen.add(item.key);
		const body = latex.slice(item.call.end, i + 1 < items.length ? items[i + 1].call.at : latex.length);
		const envEnd = body.search(listEnd);
		bibitems.push({ key: item.key, body: envEnd >= 0 ? body.slice(0, envEnd) : body });
	});
	return { labels: [...labels], bibitems };
}

/** \label keys only, for \ref/\cref autocompletion. */
export function extractLabels(latex: string): string[] {
	return extractDocRefs(latex).labels;
}
