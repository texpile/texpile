import type { Attrs } from 'prosemirror-model';
import { bibAuthorShort, bibDisplayText, citationText, type BiblatexReference } from '$lib/languages/typst/visual/core';
import type { LabelNumber } from '$lib/languages/typst/visual/core';

export type TypstRefFace = { text: string; known: boolean; title: string; kind: 'citation' | 'label' | 'written' };

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
