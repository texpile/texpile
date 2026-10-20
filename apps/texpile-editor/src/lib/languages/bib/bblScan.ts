// Citation keys and display fields scraped from a .bbl, the file bibtex/biber writes.
//
// Regex over raw text, deliberately, unlike the AST scan user documents get: a .bbl is a
// generated artifact with machine-regular structure, and reference reloads re-read every one on
// each window focus - an AST parse of a long bibliography there is cost with nothing to buy.
// Comment lines are stripped first, which is all the guarding a generated file needs.
import { bibDisplayText } from './bibDisplayText';
import type { BiblatexReference } from './types';

/** the balanced {...} group starting at text[open] (which must be '{'); backslash escapes skip. */
function braceGroup(text: string, open: number): { content: string; end: number } | null {
	if (text[open] !== '{') return null;
	let depth = 0;
	for (let i = open; i < text.length; i++) {
		const c = text[i];
		if (c === '\\') i++;
		else if (c === '{') depth++;
		else if (c === '}' && --depth === 0) return { content: text.slice(open + 1, i), end: i + 1 };
	}
	return null;
}

function stripCommentLines(text: string): string {
	return text
		.split('\n')
		.filter((line) => !/^\s*%/.test(line))
		.join('\n');
}

// display fields worth carrying into autocomplete; everything else in the entry is bookkeeping
const WANTED_FIELDS = new Set(['title', 'year', 'date', 'journaltitle', 'booktitle']);

/** author surnames from a \name{author}{N}{opts}{...} block: every family={...} inside it */
function authorFamilies(block: string): string | undefined {
	const name = block.match(/\\name\{author\}/);
	if (name?.index == null) return undefined;
	// skip the count and per-name-options groups to reach the names group
	let at = block.indexOf('{', name.index + name[0].length);
	for (let skip = 0; skip < 2 && at >= 0; skip++) {
		const g = braceGroup(block, at);
		if (!g) return undefined;
		at = block.indexOf('{', g.end);
	}
	const names = at >= 0 ? braceGroup(block, at) : null;
	if (!names) return undefined;
	const families: string[] = [];
	const fam = /family=/g;
	let m: RegExpExecArray | null;
	while ((m = fam.exec(names.content))) {
		const g = braceGroup(names.content, m.index + m[0].length);
		if (g) {
			const v = bibDisplayText(g.content);
			if (v) families.push(v);
		}
	}
	return families.length ? families.join(', ') : undefined;
}

/**
 * References from a biber-written .bbl: one \entry{key}{type}{...} block per reference,
 * fields as \field{name}{value}. Best-effort - key and entrytype are exact, the rest is display.
 */
export function parseBblEntries(text: string): BiblatexReference[] {
	const src = stripCommentLines(text);
	const out: BiblatexReference[] = [];
	const seen = new Set<string>();
	const head = /\\entry\{([^{}]*)\}\{([^{}]*)\}/g;
	const heads: { key: string; type: string; start: number; bodyStart: number }[] = [];
	let h: RegExpExecArray | null;
	while ((h = head.exec(src)))
		heads.push({ key: h[1].trim(), type: h[2].trim().toLowerCase(), start: h.index, bodyStart: h.index + h[0].length });
	for (let i = 0; i < heads.length; i++) {
		const { key, type, bodyStart } = heads[i];
		if (!key || seen.has(key)) continue;
		seen.add(key);
		const endEntry = src.indexOf('\\endentry', bodyStart);
		const nextStart = i + 1 < heads.length ? heads[i + 1].start : src.length;
		const block = src.slice(bodyStart, Math.min(nextStart, endEntry < 0 ? src.length : endEntry));
		const ref: BiblatexReference = { key, entrytype: type || 'misc', fromBbl: true };
		const field = /\\field\{([a-z]+)\}/g;
		let f: RegExpExecArray | null;
		while ((f = field.exec(block))) {
			if (!WANTED_FIELDS.has(f[1]) || ref[f[1]] != null) continue;
			const g = braceGroup(block, f.index + f[0].length);
			if (g) ref[f[1]] = bibDisplayText(g.content);
		}
		const author = authorFamilies(block);
		if (author) ref.author = author;
		out.push(ref);
	}
	return out;
}
