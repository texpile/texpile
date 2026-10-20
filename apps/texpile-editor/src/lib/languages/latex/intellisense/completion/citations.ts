/* eslint id-denylist: "off" -- "info" here is @codemirror/autocomplete's Completion field, also the vendored LaTeX Workshop data shape */
// \cite-family completion, sourced from the parsed .bib entries already loaded into referenceStore.
// options match on key+author+title+year (LW's filterText idea) while showing and inserting just
// the key, so typing an author surname or a title word surfaces the entry.
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { BiblatexReference } from '$lib/languages/bib/biblatex';
import { referenceStore } from '$lib/stores/editorStore';
import { argumentAt } from '../../knowledge/calls/commandCalls';
import { lastListToken } from './shared';

// a cite call longer than this is not read for completion
const READ_BEHIND = 2000;

const INFO_FIELDS: Array<keyof BiblatexReference> = [
	'author',
	'title',
	'journal',
	'journaltitle',
	'booktitle',
	'publisher',
	'year',
	'date'
];

function citationInfo(r: BiblatexReference): (() => Node) | undefined {
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

function citationOption(r: BiblatexReference): Completion {
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
	const refs = referenceStore.current ?? [];
	if (!refs.length) return null;
	const behind = ctx.state.sliceDoc(Math.max(0, ctx.pos - READ_BEHIND), ctx.pos);
	const open = argumentAt(behind, ['citekey']);
	if (!open || open.arg.arg.defines) return null;
	const from = ctx.pos - behind.length + open.value.at;
	return lastListToken({ from, text: open.value.value }, refs.map(citationOption));
}
