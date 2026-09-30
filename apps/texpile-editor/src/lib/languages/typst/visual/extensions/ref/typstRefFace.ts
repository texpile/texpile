// how an `@target` reads on the page, resolving only what an authority can answer.
//
//   - a bibliography key renders as the citation will read, "(Author Year, p. 7)", in the form
//     the citation asks for, because a parsed .bib entry is data the editor holds
//   - everything else stays as it is written, "@target" and its supplement. Typst numbering is the
//     template's #set rule, which this editor does not evaluate, and typst has no .aux to read a
//     number back from - so the label IS the honest display. Counting tables and figures here
//     produced a number that looked like the compiler's and was not.
import type { Attrs } from 'prosemirror-model';
import { bibAuthorShort, bibDisplayText, type BiblatexReference } from '$lib/languages/bib/biblatex';
import { citationText } from '$lib/editor/visual/extensions/citation/citationText';

export type TypstRefFace = { text: string; known: boolean; title: string };

export function typstRefFace(attrs: Attrs, references: BiblatexReference[] | null): TypstRefFace {
	const target = String(attrs.target ?? '');
	const supplement = typeof attrs.supplement === 'string' ? attrs.supplement : null;
	const bib = references?.find((r) => r.key === target);
	if (!bib) return { text: supplement == null ? `@${target}` : `@${target}[${supplement}]`, known: false, title: target };
	const author = bibAuthorShort(bib.author) || 'Unknown';
	const year = bib.year ?? bib.date?.slice(0, 4) ?? 'n.d.';
	const title = [`@${target}`, bib.title].filter(Boolean).join(' - ');
	const work = [{ author, year }];
	switch (attrs.form) {
		case 'author':
			return { text: author, known: true, title };
		case 'year':
			return { text: year, known: true, title };
		case 'full':
			return { text: [author, bibDisplayText(bib.title), year].filter(Boolean).join(', '), known: true, title };
		case 'prose':
			return { text: citationText('textcite', work, '', supplement ?? ''), known: true, title };
		default:
			return { text: citationText('cite', work, '', supplement ?? ''), known: true, title };
	}
}
