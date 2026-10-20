// uses of a label or cite key in other files, matched as the name alone so a rename rewrites nothing else
import type { EditsSpec, ReplaceSpec, RewriteSpec } from '$lib/search/replaceInFiles';
import { callsIn, rolesOf, type CommandReadings } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { ownReadingsIn, type ProjectDefinition } from '$lib/languages/latex/userDefinitions';
import { blankUnread, codeOnly } from '$lib/languages/latex/texCode';
import { keyValuesOfRole, type KeyValue } from '$lib/languages/latex/knowledge/calls/keyLabels';
import type { LoadedFile } from '$lib/languages/latex/knowledge/loadedFiles';
import type { Role } from '$lib/languages/latex/knowledge/types';
import type { TextEdit } from './textEdits';

export type UseKind = 'label' | 'cite' | 'glossary';

/** `definitions`: the places that create the name (\label, \bibitem, \newglossaryentry, a label= key) are renamed too;
 * `loaded` names the files whose option keys define labels */
export type RenameScope = { definitions?: boolean; loaded?: LoadedFile[] };
export type UseLanguage = 'latex' | 'typst';

export function useLanguageOf(path: string): UseLanguage | null {
	const ext = /\.([^./\\]+)$/.exec(path)?.[1]?.toLowerCase();
	if (ext === 'tex' || ext === 'ltx' || ext === 'sty' || ext === 'cls') return 'latex';
	if (ext === 'typ') return 'typst';
	return null;
}

const ROLE_OF_USE: Record<UseKind, Role> = { label: 'label', cite: 'citekey', glossary: 'glossary' };

/** the wrapper commands (\newcommand{\figref}[1]{\ref{#1}}) that the files' code and the project's definitions make */
export function wrapperReadingsIn(texts: string[], project: readonly ProjectDefinition[] = []): CommandReadings {
	return Object.assign({}, ...texts.map((text) => ownReadingsIn(codeOnly(text), project)));
}

const READ_COMMENTS = { masked: 'verbatim', openings: true } as const;

// the text of the comments and skipped bodies alone, the rest blanked, to scan commented-out code the way code is
function remarksIn(read: string, code: string): string {
	let out = '';
	for (let i = 0; i < read.length; i++) out += code[i] === read[i] ? (read[i] === '\n' ? '\n' : ' ') : read[i];
	return out;
}

// the items of a key's value at the top level of its list, after an optional [tag] (see={[see also]a,b})
function listItemsIn({ value, at }: KeyValue): KeyValue[] {
	const items: KeyValue[] = [];
	let pos = /^\[[^\]]*\]\s*/.exec(value)?.[0].length ?? 0;
	for (const part of value.slice(pos).split(',')) {
		const lead = part.length - part.trimStart().length;
		if (part.trim()) items.push({ value: part.trim(), at: at + pos + lead });
		pos += part.length + 1;
	}
	return items;
}

function namesIn(text: string, from: string, kind: UseKind, own: CommandReadings, scope: RenameScope): number[] {
	const role = ROLE_OF_USE[kind];
	const sites = callsIn(text, [role], own).flatMap((call) =>
		call.args
			.filter((a) => rolesOf(a.arg).includes(role) && (scope.definitions || !a.arg.defines))
			.flatMap((a) => a.values.filter((v) => v.value === from).map((v) => v.at))
	);
	// a label= key of a listing defines a label; a glossary entry's parent= or see= names another
	const keyed: KeyValue[] = [];
	if (scope.loaded && scope.definitions && kind === 'label') keyed.push(...keyValuesOfRole(text, scope.loaded, 'label'));
	if (scope.loaded && kind === 'glossary') keyed.push(...keyValuesOfRole(text, scope.loaded, 'glossary').flatMap(listItemsIn));
	return [...sites, ...keyed.filter((v) => v.value === from).map((v) => v.at)].filter((at) => text.startsWith(from, at));
}

// verbatim text keeps its words; a comment and a \iffalse block are commented-out code and follow the rename
function latexRenameEdits(text: string, kind: UseKind, from: string, to: string, own: CommandReadings, scope: RenameScope): TextEdit[] {
	const read = blankUnread(text, READ_COMMENTS);
	const code = blankUnread(text, { masked: 'all', openings: true });
	const found = new Set(namesIn(code, from, kind, own, scope));
	if (code !== read) for (const at of namesIn(remarksIn(read, code), from, kind, own, scope)) found.add(at);
	return [...found].sort((a, b) => a - b).map((at) => ({ from: at, to: at + from.length, insert: to }));
}

export function renameSpec(
	kind: UseKind,
	from: string,
	to: string,
	lang: UseLanguage,
	own: CommandReadings = {},
	scope: RenameScope = {}
): RewriteSpec {
	// typst: @name or <name>, labels and keys alike; a full stop after @name ends the sentence
	if (lang === 'typst') {
		const n = escapeRe(from);
		return literalRename(`(?<=(?<![\\w@])@)${n}(?![\\w:-]|\\.\\w)|(?<=<)${n}(?=>)`, to);
	}
	return { edits: (text) => latexRenameEdits(text, kind, from, to, own, scope) };
}

const BIB_FIELDS_NAMING_KEYS = ['crossref', 'xref', 'xdata', 'related'];

// a field name in either case: BibTeX field names do not care
function anyCase(word: string): string {
	return word.replace(/./g, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
}

/** the key of the entry head (@book{key, which may run over lines) and the entries that point at it as a whole list item
 * of crossref, xref, xdata or related */
export function renameBibSpec(from: string, to: string): EditsSpec {
	const n = escapeRe(from);
	const fields = BIB_FIELDS_NAMING_KEYS.map(anyCase).join('|');
	const head = new RegExp(`(?<=^\\s*@[A-Za-z]+\\s*[{(]\\s*)${n}(?=\\s*,)`, 'gm');
	const pointer = new RegExp(`(?<![^{",\\s])${n}(?![^}",\\s])(?<=\\b(?:${fields})\\s*=\\s*[{"]?[^{}"=]*?${n})`, 'g');
	return {
		edits: (text) =>
			[...text.matchAll(head), ...text.matchAll(pointer)]
				.sort((a, b) => a.index - b.index)
				.map((m) => ({ from: m.index, to: m.index + from.length, insert: to }))
	};
}

// a regex replacement reads $ as a group reference; the new name is literal
function literalRename(query: string, to: string): ReplaceSpec {
	return { query, replacement: to.replace(/\$/g, '$$$$'), regex: true, caseSensitive: true };
}

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
