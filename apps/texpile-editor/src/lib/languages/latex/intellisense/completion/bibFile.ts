// completion for editing a .bib file directly in Source mode (writing entries), distinct from
// citations.ts (which reads .bib to complete \cite{...} keys inside .tex). the curated
// biblatex/fieldConfig.ts entries (shared with BibManager's add-entry form) come first; biblatex's data model fills in
// everything the form doesn't offer.
import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { OFFERED_ENTRY_TYPES, entryTypeAt, fieldsForType, getEntryTypeOptions, getFieldsForType } from '$lib/languages/bib/biblatex';
import { BIB_MANDATORY, BIB_TYPE_ALIASES } from '$lib/languages/latex/knowledge/registries/bibModel';

const ENTRY_TYPE_TRIGGER = /^@[a-zA-Z]*$/;
const BARE_LINE = /^\s*[a-zA-Z]*$/;
// captures the field name and whatever's already been typed into the value, so re-typing after
// the opening delimiter still matches (not just the instant "{"/'"' is typed)
const FIELD_VALUE_START = /^\s*([a-zA-Z]+)\s*=\s*[{"]?([^,{}"\n]*)$/;

// every field of an all-rule in the form's order, then year (else the first) of each one-of rule
function requiredFields(type: string): string[] {
	const rules = BIB_MANDATORY[type] ?? [];
	const formOrder = getFieldsForType(type).map((f) => f.name);
	function rank(f: string): number {
		return formOrder.includes(f) ? formOrder.indexOf(f) : formOrder.length;
	}
	const all = [...new Set(rules.flatMap((c) => c.all ?? []))].sort((a, b) => rank(a) - rank(b));
	const oneOf = rules.flatMap((c) => {
		const group = c.xor ?? c.or;
		return group ? [group.includes('year') ? 'year' : group[0]] : [];
	});
	return [...new Set([...all, ...oneOf])];
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
		...[...OFFERED_ENTRY_TYPES, ...Object.keys(BIB_TYPE_ALIASES)].filter((t) => !curatedSet.has(t)).map((t) => entryTypeSnippet(t))
	];
})();

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

	// fields and their values only inside an entry: BibTeX reads text between entries as a comment
	const line = ctx.state.doc.lineAt(ctx.pos);
	const type = entryTypeAt(ctx.state.doc.toString(), line.from);
	if (!type) return null;
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
		const known = new Set(requiredFields(type));
		const optional = [...new Set([...getFieldsForType(type).map((f) => f.name), ...fieldsForType(type)])].filter(
			(n) => !known.has(n) && n !== 'key'
		);
		if (!optional.length) return null;
		return {
			from: bare.from,
			options: optional.map((f) => snippetCompletion(`${f} = {\${1}}`, { label: f, type: 'property' })),
			validFor: /^[a-zA-Z]*$/
		};
	}
	return null;
}
