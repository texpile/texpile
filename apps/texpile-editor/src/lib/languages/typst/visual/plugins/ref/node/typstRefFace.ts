// how an `@target` reads on the page, resolving only what the editor can answer.
//
//   - a bibliography key renders as the citation will read, "(Author Year, p. 7)", in the form
//     the citation asks for, because a parsed .bib entry is data the editor holds
//   - a label of the document renders as the reference prints, "Table 1", when the numbers can be
//     counted from the document's own set rules (labelNumbers.ts)
//   - everything else stays as it is written, "@target" and its supplement
import type { Attrs } from 'prosemirror-model';
import { bibAuthorShort, bibDisplayText, citationText, type BiblatexReference } from '$lib/languages/typst/visual/core';
import type { LabelNumber } from './labelNumbers';

export type TypstRefFace = { text: string; known: boolean; title: string; kind: 'citation' | 'label' | 'written' };

// a supplement that is plain words, which the reference can print as typed
const PLAIN_SUPPLEMENT = /^[^\\[\]#*_`$<>@~]*$/;

function labelText(number: NonNullable<LabelNumber>, supplement: string | null): string | null {
	if (supplement === null) return `${number.supplement} ${number.number}`;
	if (!PLAIN_SUPPLEMENT.test(supplement)) return null;
	return supplement.trim() ? `${supplement.trim()} ${number.number}` : number.number;
}

export function typstRefFace(
	attrs: Attrs,
	references: BiblatexReference[] | null,
	labels: ReadonlyMap<string, LabelNumber> | null = null
): TypstRefFace {
	const target = String(attrs.target ?? '');
	const supplement = typeof attrs.supplement === 'string' ? attrs.supplement : null;
	const bib = references?.find((r) => r.key === target);
	if (!bib) {
		const number = labels?.get(target);
		const text = number ? labelText(number, supplement) : null;
		if (text) return { text, known: true, title: `@${target}`, kind: 'label' };
		return { text: supplement == null ? `@${target}` : `@${target}[${supplement}]`, known: false, title: target, kind: 'written' };
	}
	const author = bibAuthorShort(bib.author) || 'Unknown';
	const year = bib.year ?? bib.date?.slice(0, 4) ?? 'n.d.';
	const title = [`@${target}`, bib.title].filter(Boolean).join(' - ');
	const work = [{ author, year }];
	switch (attrs.form) {
		case 'author':
			return { text: author, known: true, title, kind: 'citation' };
		case 'year':
			return { text: year, known: true, title, kind: 'citation' };
		case 'full':
			return { text: [author, bibDisplayText(bib.title), year].filter(Boolean).join(', '), known: true, title, kind: 'citation' };
		case 'prose':
			return { text: citationText('textcite', work, '', supplement ?? ''), known: true, title, kind: 'citation' };
		default:
			return { text: citationText('cite', work, '', supplement ?? ''), known: true, title, kind: 'citation' };
	}
}
