import { aliasCiteForm, citeFormOf } from '$lib/languages/latex/knowledge/calls/citeCommands';
import { bibAuthorShort } from '$lib/languages/bib/biblatex';
import type { BiblatexReference } from '$lib/languages/bib/biblatex';

export type CitedWork = { author?: string; year?: string; title?: string; unresolved?: string; alias?: string; printed?: string };

export type CitedGroup = { works: CitedWork[]; prenote: string; postnote: string };

function capitalized(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

// natbib and biblatex set a prenote before the works with a space, a postnote after them with a comma
function noted(prenote: string, body: string, postnote: string): string {
	return [[prenote, body].filter(Boolean).join(' '), postnote].filter(Boolean).join(', ');
}

type CitationParts = { body: string; wrapped: boolean; bracketed?: boolean };

// a text citation (\citet, \textcite) puts the author in the sentence and brackets only the year
function citationParts(variant: string, works: CitedWork[], prenote: string, postnote: string): CitationParts {
	const form = citeFormOf(variant);
	const resolved = works.length > 0 && works.every((w) => w.unresolved == null);
	function named(w: CitedWork): string {
		return /^[A-Z]/.test(variant) ? capitalized(w.author ?? '') : (w.author ?? '');
	}
	const aliasForm = aliasCiteForm(variant);
	if (aliasForm && works.length > 0 && works.every((w) => w.alias !== undefined)) {
		const aliases = works.map((w) => w.alias).join('; ');
		if (aliasForm === 'text') {
			const body = postnote ? `${aliases} (${postnote})` : aliases;
			return { body: prenote ? `${prenote} ${body}` : body, wrapped: false };
		}
		return { body: noted(prenote, aliases, postnote), wrapped: true };
	}
	if (resolved && works.every((w) => w.printed !== undefined))
		return { body: noted(prenote, works.map((w) => w.printed).join(', '), postnote), wrapped: true, bracketed: true };
	// an unresolved key falls back to the parenthetical form, which is the one that can show it
	if (resolved && form === 'text') {
		const body = works.map((w) => `${named(w)} (${[w.year, postnote].filter(Boolean).join(', ')})`).join('; ');
		return { body: prenote ? `${prenote} ${body}` : body, wrapped: false };
	}
	if (resolved && form === 'author') return { body: works.map(named).join('; '), wrapped: false };
	if (resolved && form === 'year') return { body: works.map((w) => w.year).join(', '), wrapped: false };
	if (resolved && form === 'title') return { body: works.map((w) => w.title ?? '').join('; '), wrapped: false };
	if (resolved && form === 'year-paren') return { body: works.map((w) => w.year).join(', '), wrapped: true };
	const body = works.map((w) => w.unresolved ?? `${named(w)} ${w.year}`).join('; ');
	if (resolved && (form === 'paren-bare' || form === 'text-bare' || form === 'super' || form === 'full')) {
		return { body: noted(prenote, body, postnote), wrapped: false };
	}
	return { body: noted(prenote, body, postnote), wrapped: true };
}

export function citationText(variant: string, works: CitedWork[], prenote: string, postnote: string): string {
	const { body, wrapped, bracketed } = citationParts(variant, works, prenote.replace(/~/g, '\u00a0'), postnote.replace(/~/g, '\u00a0'));
	return bracketed ? `[${body}]` : wrapped ? `(${body})` : body;
}

export function citationGroupsText(variant: string, groups: CitedGroup[], multiprenote: string, multipostnote: string): string {
	const parts = groups.map((g) => citationParts(variant, g.works, g.prenote, g.postnote));
	const wrapped = parts.some((p) => p.wrapped);
	const body = [multiprenote, parts.map((p) => p.body).join('; '), multipostnote].filter(Boolean).join(' ');
	if (parts.length && parts.every((p) => p.bracketed)) return `[${body}]`;
	return wrapped ? `(${body})` : body;
}

export function citedWorks(keys: string[], references: BiblatexReference[], aliases: Record<string, string> = {}): CitedWork[] {
	return keys.map((key) => {
		const alias = Object.hasOwn(aliases, key) ? { alias: aliases[key] } : {};
		const reference = references.find((ref) => ref.key === key);
		if (!reference) return { unresolved: keys.length === 1 ? `${key} not found` : key, ...alias };
		if (typeof reference.printed === 'string') return { printed: reference.printed, ...alias };
		return {
			author: reference.printedAuthor ?? bibAuthorShort(String(reference.author)),
			year: reference.year || reference.date?.slice(0, 4) || 'n.d.',
			title: reference.title ? String(reference.title) : undefined,
			...alias
		};
	});
}
