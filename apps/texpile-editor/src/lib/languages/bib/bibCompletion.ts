import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { BIB_ENTRY_TYPES, BIB_FIELDS, BIB_FIELD_ALIASES } from './bibDatamodel';
import { fieldsForType } from './bibValidate';

/** entry types worth offering: the machinery ones are not bibliography */
const MACHINERY = new Set(['xdata', 'set', 'customa', 'customb', 'customc', 'customd', 'custome', 'customf']);
export const OFFERED_ENTRY_TYPES = BIB_ENTRY_TYPES.filter((t) => !MACHINERY.has(t));

/**
 * The entry type whose braces contain `pos`, or null when the cursor is between entries.
 *
 * Read backwards from the cursor rather than by parsing the file: completion runs on every
 * keystroke, and the entry being typed is usually the last one in a long file.
 */
export function entryTypeAt(text: string, pos: number): string | null {
	const head = /@([a-zA-Z]+)\s*\{/g;
	let found: { type: string; open: number } | null = null;
	for (let m = head.exec(text); m && m.index < pos; m = head.exec(text)) {
		found = { type: m[1].toLowerCase(), open: m.index + m[0].length - 1 };
	}
	if (!found) return null;
	// still inside only if the braces opened there have not closed again
	let depth = 0;
	for (let i = found.open; i < pos; i++) {
		if (text[i] === '{') depth++;
		else if (text[i] === '}') depth--;
		if (depth === 0 && i > found.open) return null;
	}
	return found.type;
}

function label(field: string): string | undefined {
	const spec = BIB_FIELDS[field];
	if (!spec) return undefined;
	return spec.kind === 'list' ? `${spec.datatype} list` : spec.datatype;
}

/**
 * Entry types after `@`, and field names inside an entry, taken from biblatex's own data model so
 * the list is the one biber will accept. Legacy spellings are offered too, marked with what they
 * become, since a bibliography full of them is not wrong and completing to `journal` should not be
 * harder than completing to `journaltitle`.
 */
export function bibCompletions(context: CompletionContext): CompletionResult | null {
	const atType = context.matchBefore(/@[a-zA-Z]*/);
	if (atType) {
		return {
			from: atType.from + 1,
			options: OFFERED_ENTRY_TYPES.map((type) => ({ label: type, type: 'class' })),
			validFor: /^[a-zA-Z]*$/
		};
	}

	const word = context.matchBefore(/[a-zA-Z][a-zA-Z0-9_-]*/);
	if (!word || (word.from === word.to && !context.explicit)) return null;

	const type = entryTypeAt(context.state.doc.toString(), word.from);
	if (!type) return null;

	// a field name sits at the start of its own line, or straight after the comma before it
	const lineStart = context.state.doc.lineAt(word.from).from;
	if (!/^[\s,{]*$/.test(context.state.sliceDoc(lineStart, word.from))) return null;

	const options = fieldsForType(type).map((field) => ({ label: field, type: 'property', detail: label(field) }));
	for (const [legacy, modern] of Object.entries(BIB_FIELD_ALIASES)) {
		options.push({ label: legacy, type: 'property', detail: `${modern}` });
	}
	return { from: word.from, options, validFor: /^[a-zA-Z0-9_-]*$/ };
}
