import type { BiblatexReference } from './types';
import { parseBibtexTokens, type BibToken } from './bibtexParser';
import { toBibtex } from './bibtexWriter';

/** internal bookkeeping fields, must never leak into .bib output. */
const INTERNAL_FIELDS = new Set(['key', 'entrytype', 'raw', 'displayLabel', 'hasInlineComment']);

export function findDuplicateKeys(references: BiblatexReference[]): string[] {
	const keys = new Set<string>();
	const duplicates = new Set<string>();

	for (const ref of references) {
		if (keys.has(ref.key)) {
			duplicates.add(ref.key);
		} else {
			keys.add(ref.key);
		}
	}

	return Array.from(duplicates);
}

/** true when the key is unique; excludeKey ignores the ref being edited. */
export function isKeyUnique(key: string, existingReferences: BiblatexReference[], excludeKey?: string): boolean {
	return !existingReferences.some((r) => r.key === key && r.key !== excludeKey);
}

/** tokens is the full file-order stream so the serializer can round-trip everything; entries is the entry-only view. */
export type ParseBibtexResult = {
	tokens: BibToken[];
	entries: BiblatexReference[];
	warnings: { key: string; issues: string[] }[];
	parseError?: string;
};

export function parseBibtex(bibtexContent: string): BiblatexReference[] {
	return parseBibtexWithWarnings(bibtexContent).entries;
}

/**
 * Read path: every syntactically valid entry survives, no schema enforcement or aliasing.
 * A whole-file parse failure returns parseError so the UI can fall back to raw CodeMirror.
 */
export function parseBibtexWithWarnings(bibtexContent: string): ParseBibtexResult {
	if (!bibtexContent || !bibtexContent.trim()) {
		return { tokens: [], entries: [], warnings: [] };
	}

	let tokens: BibToken[];
	try {
		tokens = parseBibtexTokens(bibtexContent);
	} catch (error) {
		return { tokens: [], entries: [], warnings: [], parseError: String(error) };
	}

	const entries: BiblatexReference[] = [];
	for (const token of tokens) {
		if (token.kind !== 'entry') continue;
		const rawEntry = token.entry;
		if (!rawEntry.citationKey) continue; // an entry without a key can't be cited
		entries.push(entryFromToken(token));
	}

	return { tokens, entries, warnings: [] };
}

/** converts one entry token into the loose BiblatexReference consumers read. */
function entryFromToken(token: Extract<BibToken, { kind: 'entry' }>): BiblatexReference {
	const rawEntry = token.entry;
	const entry: BiblatexReference = {
		key: rawEntry.citationKey,
		entrytype: rawEntry.entryType.toLowerCase()
	};
	// fields land under their lowercased names, exactly as written: no journal/journaltitle
	// aliasing, the visual form's schema complains on save instead
	for (const [k, v] of Object.entries(rawEntry.entryTags)) {
		if (v !== undefined && v !== '') entry[k.toLowerCase()] = v;
	}
	entry.raw = token.raw;
	entry.hasInlineComment = token.hasInlineComment;
	entry.displayLabel = computeDisplayLabel(entry);
	return entry;
}

/** re-parses one entry edited in the raw pane; returns { error } unless exactly one keyed entry parses. */
export function parseSingleEntry(text: string): { entry: BiblatexReference } | { error: string } {
	let tokens: BibToken[];
	try {
		tokens = parseBibtexTokens(text);
	} catch (e) {
		return { error: String(e) };
	}
	const entryTokens = tokens.filter((t): t is Extract<BibToken, { kind: 'entry' }> => t.kind === 'entry');
	if (entryTokens.length === 0) return { error: 'No entry found. The block must start with `@type{key, ...}`.' };
	if (entryTokens.length > 1) return { error: 'Expected exactly one entry, found ' + entryTokens.length + '.' };
	const token = entryTokens[0];
	if (!token.entry.citationKey) return { error: 'Entry is missing a citation key.' };
	return { entry: entryFromToken(token) };
}

/**
 * Emit a .bib from the token stream. Non-entry tokens re-emit verbatim (that's how comments,
 * @Preamble and @String round-trip); entry tokens look up refsByKey, missing means deleted.
 * Tokens are joined on the file's own bytes between them; one added since gets a blank line.
 */
export function serializeBibtex(tokens: BibToken[], refsByKey: Map<string, BiblatexReference>): string {
	let out = '';
	let tail = '\n';
	for (const token of tokens) {
		if (token.post !== undefined) tail = token.post;
		let text: string;
		if (token.kind === 'entry') {
			const key = token.entry.citationKey;
			const ref = refsByKey.get(key);
			if (!ref) continue; // deleted
			// a key the file holds twice maps to one reference: an entry that is still the other's twin keeps its own bytes
			const twin =
				ref.raw !== undefined &&
				ref.raw !== token.raw &&
				tokens.some((t) => t !== token && t.kind === 'entry' && t.entry.citationKey === key && t.raw === ref.raw);
			// prefer untouched raw so inside-entry formatting round-trips; regenerate once the form edited it
			text = twin ? token.raw : (ref.raw ?? renderReferenceAsBib(ref));
		} else {
			text = token.text;
		}
		// the file's lead belongs to its first token; nothing goes before another that ends up first
		const lead = token === tokens[0] ? (token.pre ?? '') : '';
		out += (out ? (token.pre ?? '\n\n') : lead) + text;
	}
	return out + tail;
}

/** renders one loose reference as a pretty-printed @type{key, field = {value}, ...} block. */
function renderReferenceAsBib(ref: BiblatexReference): string {
	const entryTags: Record<string, string> = {};
	for (const [field, value] of Object.entries(ref)) {
		if (INTERNAL_FIELDS.has(field)) continue;
		if (value === undefined || value === '') continue;
		entryTags[field] = Array.isArray(value) ? value.join(' and ') : String(value);
	}
	return toBibtex([{ citationKey: ref.key, entryType: ref.entrytype, entryTags }], false).trimEnd();
}

/** short label for \cite autocomplete, best effort. */
function computeDisplayLabel(entry: BiblatexReference): string {
	// first author's last name: split on " and ", take the part before the comma
	const firstAuthor = entry.author
		?.split(/\s+and\s+/i)[0]
		?.split(',')[0]
		?.trim();
	const year = entry.year || entry.date?.slice(0, 4);
	// strip braces, cap length so the dropdown row doesn't wrap
	const title = entry.title?.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
	const bits: string[] = [];
	if (firstAuthor) bits.push(firstAuthor);
	if (year) bits.push(`(${year})`);
	if (title) bits.push(`· ${title}`);
	return bits.length ? bits.join(' ') : entry.key;
}

export function referencesToBib(
	references: BiblatexReference[] | Record<string, BiblatexReference> | BiblatexReference | null | undefined
): string {
	const refsArray: BiblatexReference[] = Array.isArray(references)
		? references
		: references && typeof references === 'object'
			? 'entrytype' in references && 'key' in references
				? [references as BiblatexReference]
				: Object.values(references as Record<string, BiblatexReference>)
			: [];

	// skip internal fields so they don't leak into the emitted .bib
	const rawEntries = refsArray.map((ref) => {
		const entryTags: Record<string, string> = {};
		for (const [field, value] of Object.entries(ref)) {
			if (INTERNAL_FIELDS.has(field)) continue;
			if (value === undefined || value === '') continue;
			entryTags[field] = Array.isArray(value) ? value.join(' and ') : String(value);
		}
		return { citationKey: ref.key, entryType: ref.entrytype, entryTags };
	});

	return toBibtex(rawEntries, false); // false = pretty-printed
}
