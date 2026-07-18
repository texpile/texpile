// \cite-family completion, sourced from the parsed .bib entries already loaded into referenceStore.
// options match on key+author+title+year (LW's filterText idea) while showing and inserting just
// the key, so typing an author surname or a title word surfaces the entry.
import { get } from 'svelte/store';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { BibLaTeXReference } from '$lib/biblatex';
import { referenceStore } from '$lib/stores/editorStore';
import { lastListToken } from './shared';

// the \cite family with natbib (pre)(post) groups, beamer <overlay>, optional [..] pre/postnotes,
// plus \bibentry and csquotes' \cquote/\textcquote (whose first brace arg is the key)
const CITE_BEFORE =
	/\\(?:[a-zA-Z]*[Cc]ite[a-zA-Z]*\*?(?:\([^()]*\)){0,2}|bibentry|(?:text)?cquote\*?)(?:<[^<>]*>)?(?:\[[^\]]*\])*\{[^{}]*$/;

const INFO_FIELDS: Array<keyof BibLaTeXReference> = [
	'author',
	'title',
	'journal',
	'journaltitle',
	'booktitle',
	'publisher',
	'year',
	'date'
];

function citationInfo(r: BibLaTeXReference): (() => Node) | undefined {
	const rows = INFO_FIELDS.map((f) => [f, r[f]] as const).filter(([, v]) => v != null && v !== '');
	if (!rows.length) return undefined;
	return () => {
		const dom = document.createElement('div');
		for (const [f, v] of rows) {
			const line = dom.appendChild(document.createElement('div'));
			line.textContent = `${f}: ${String(v)}`;
		}
		return dom;
	};
}

function citationOption(r: BibLaTeXReference): Completion {
	const author = r.author ? String(r.author) : '';
	const title = r.title ? String(r.title) : '';
	const year = r.year ? String(r.year) : r.date ? String(r.date) : '';
	return {
		label: [r.key, author, title, year].filter(Boolean).join(' '),
		displayLabel: r.key,
		apply: r.key,
		detail: title ? title.slice(0, 50) : author ? author.slice(0, 50) : undefined,
		info: citationInfo(r),
		type: 'variable'
	};
}

export function citationCompletionSource(ctx: CompletionContext): CompletionResult | null {
	const cite = ctx.matchBefore(CITE_BEFORE);
	if (!cite) return null;
	const refs = get(referenceStore) ?? [];
	if (!refs.length) return null;
	return lastListToken(cite, refs.map(citationOption));
}
