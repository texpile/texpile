// completion for editing a .bib file directly in Source mode (writing entries), distinct from
// citations.ts (which reads .bib to complete \cite{...} keys inside .tex). the curated
// biblatex/fieldConfig.ts entries (shared with BibManager's add-entry form) come first; the full
// vendored biblatex type/field lists (data/bibEntries.ts) fill in everything the form doesn't offer.
import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { getEntryTypeOptions, getFieldsForType, getRequiredFields } from '$lib/biblatex';
import { BIB_ENTRY_TYPES } from '../data/bibEntries';

const ENTRY_TYPE_TRIGGER = /^@[a-zA-Z]*$/;
const BARE_LINE = /^\s*[a-zA-Z]*$/;
// captures the field name and whatever's already been typed into the value, so re-typing after
// the opening delimiter still matches (not just the instant "{"/'"' is typed)
const FIELD_VALUE_START = /^\s*([a-zA-Z]+)\s*=\s*[{"]?([^,{}"\n]*)$/;

function requiredFields(type: string): string[] {
	const curated = getRequiredFields(type);
	return curated.length ? curated : (BIB_ENTRY_TYPES[type]?.required ?? []);
}

function entryTypeSnippet(type: string, boost?: number): Completion {
	const required = requiredFields(type);
	const fields = required.length ? ['key', ...required.filter((f) => f !== 'key')] : ['key'];
	const body = fields.map((f, i) => (f === 'key' ? `\${${i + 1}:key}` : `\t${f} = {\${${i + 1}}}`)).join(',\n');
	return snippetCompletion(`${type}{${body}\n}`, { label: `@${type}`, type: 'class', boost });
}

const ENTRY_TYPE_OPTIONS: Completion[] = (() => {
	const curated = getEntryTypeOptions().map((o) => o.value);
	const curatedSet = new Set(curated);
	return [
		...curated.map((t) => entryTypeSnippet(t, 10)), // the everyday set ranks first
		...Object.keys(BIB_ENTRY_TYPES)
			.filter((t) => !curatedSet.has(t))
			.map((t) => entryTypeSnippet(t))
	];
})();

/** which entry type encloses the given line, by scanning upward for the nearest "@type{". */
function enclosingEntryType(state: CompletionContext['state'], lineNumber: number): string | null {
	for (let n = lineNumber; n >= Math.max(1, lineNumber - 100); n--) {
		const text = state.doc.line(n).text;
		const m = /^\s*@([a-zA-Z]+)\s*\{/.exec(text);
		if (m) return m[1].toLowerCase();
	}
	return null;
}

function previousFieldValues(state: CompletionContext['state'], skipLine: number, field: string): string[] {
	const re = new RegExp(`\\b${field}\\s*=\\s*(\\{([^{}]*)\\}|"([^"]*)"|([^,\\n]+))`, 'i');
	const values = new Set<string>();
	for (let n = 1; n <= state.doc.lines; n++) {
		if (n === skipLine) continue; // don't self-match the line being typed
		const m = re.exec(state.doc.line(n).text);
		if (!m) continue;
		const value = (m[2] ?? m[3] ?? m[4] ?? '').trim();
		if (value) values.add(value);
	}
	return [...values];
}

export function bibFileCompletionSource(ctx: CompletionContext): CompletionResult | null {
	const entryType = ctx.matchBefore(ENTRY_TYPE_TRIGGER);
	if (entryType) {
		return {
			from: entryType.from + 1,
			options: ENTRY_TYPE_OPTIONS,
			validFor: /^[a-zA-Z]*$/
		};
	}

	const line = ctx.state.doc.lineAt(ctx.pos);
	const fieldValue = FIELD_VALUE_START.exec(line.text.slice(0, ctx.pos - line.from));
	if (fieldValue) {
		const values = previousFieldValues(ctx.state, line.number, fieldValue[1]);
		if (!values.length) return null;
		const typed = fieldValue[2] ?? '';
		return {
			from: ctx.pos - typed.length,
			options: values.map((v) => ({ label: v, type: 'text' })),
			validFor: /^[^,{}"\n]*$/
		};
	}

	const bare = ctx.matchBefore(BARE_LINE);
	if (bare) {
		const type = enclosingEntryType(ctx.state, line.number);
		if (!type) return null;
		const known = new Set(requiredFields(type));
		const spec = BIB_ENTRY_TYPES[type];
		const optional = [
			...new Set([...getFieldsForType(type).map((f) => f.name), ...(spec ? [...spec.required, ...spec.optional] : [])])
		].filter((n) => !known.has(n) && n !== 'key');
		if (!optional.length) return null;
		return {
			from: bare.from,
			options: optional.map((f) => snippetCompletion(`${f} = {\${1}}`, { label: f, type: 'property' })),
			validFor: /^[a-zA-Z]*$/
		};
	}
	return null;
}
