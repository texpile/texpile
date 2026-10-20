// glossary/acronym completion for the entry-label argument of \gls, \acs and the rest of the loaded glossary packages,
// sourced from the definitions in the buffer, other project files (projectIntel), and bib2gls .bib entries already
// loaded into referenceStore.
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { referenceStore } from '$lib/stores/editorStore';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { docText } from '$lib/editor/source/docText';
import { argumentAt, callsIn, rolesOf } from '../../knowledge/calls/commandCalls';
import { keyValuesIn } from '../../knowledge/calls/keyLabels';
import { loadedReadings } from '../../knowledge/calls/loadedReadings';
import type { LoadedFile } from '../../knowledge/loadedFiles';
import { glossaryBibTypes } from '../../knowledge/registries/glossaryBibTypes';
import { documentPackages } from '../packages/loadedPackages';
import { lastListToken } from './shared';
import type { Role } from '../../knowledge/types';

export type GlossEntry = {
	key: string;
	description: string;
	acronym: boolean;
	/** 1-based definition line, for the cross-file project scan and go-to-definition */
	line: number;
};

const MAX_SCAN_LENGTH = 2_000_000;
// acro names its entries with the acronym role alone
export const GLOSSARY_ROLES: Role[] = ['glossary', 'acronym'];
const READ_BEHIND = 2000;
let cache: { text: string; loaded: LoadedFile[]; entries: GlossEntry[] } | null = null;

/** the entries `text` defines with the loaded glossary packages' definers; also feeds the cross-file project scan. */
export function scanGlossary(text: string, loaded: LoadedFile[]): GlossEntry[] {
	if (text.length > MAX_SCAN_LENGTH) return [];
	const entries: GlossEntry[] = [];
	function lineOf(i: number): number {
		return text.slice(0, i).split('\n').length;
	}
	for (const call of callsIn(text, GLOSSARY_ROLES, loadedReadings(loaded, GLOSSARY_ROLES))) {
		const named = call.args.find((a) => a.arg.defines && rolesOf(a.arg).some((r) => GLOSSARY_ROLES.includes(r)));
		if (!named) continue;
		const later = call.args.filter((a) => a.index > named.index && a.arg.kind === 'm');
		const acronym = rolesOf(named.arg).includes('acronym');
		const described = acronym ? later.at(-1) : later.find((a) => a.arg.placeholder === 'description');
		const said = described ? text.slice(described.from, described.to) : null;
		// acro's properties: short=CPU, long=central processing unit
		const description =
			(said !== null ? (acronym ? (keyValuesIn(said, new Set(['long']))[0] ?? said) : said) : null) ??
			later.flatMap((a) => keyValuesIn(text.slice(a.from, a.to), new Set(['description'])))[0] ??
			'';
		for (const v of named.values) entries.push({ key: v.value, description: description.trim(), acronym, line: lineOf(call.at) });
	}
	return entries;
}

type KnownGloss = { description: string; acronym: boolean };

/** every entry the document can name: the buffer first, then other project files, then bib2gls .bib entries */
export async function knownGlossary(text: string, loaded: LoadedFile[]): Promise<Map<string, KnownGloss>> {
	if (cache?.text !== text || cache.loaded !== loaded) cache = { text, loaded, entries: scanGlossary(text, loaded) };
	const merged = new Map<string, KnownGloss>();
	for (const e of cache.entries) merged.set(e.key, e);
	for (const e of projectIntelStore.current.glossary) if (!merged.has(e.key)) merged.set(e.key, e);
	const bibTypes = await glossaryBibTypes();
	for (const r of referenceStore.current ?? []) {
		if (!bibTypes.has(r.entrytype) || merged.has(r.key)) continue;
		const description = typeof r.description === 'string' ? r.description : typeof r.short === 'string' ? r.short : '';
		merged.set(r.key, { description, acronym: r.entrytype.includes('acronym') || r.entrytype.includes('abbreviation') });
	}
	return merged;
}

export async function glossaryCompletionSource(ctx: CompletionContext): Promise<CompletionResult | null> {
	const behind = ctx.state.sliceDoc(Math.max(0, ctx.pos - READ_BEHIND), ctx.pos);
	if (!/\{[^{}]*$/.test(behind)) return null;
	const text = docText(ctx.state.doc);
	const loaded = await documentPackages(text);
	const open = argumentAt(behind, GLOSSARY_ROLES, loadedReadings(loaded, GLOSSARY_ROLES));
	if (!open || open.arg.arg.defines) return null;
	const merged = await knownGlossary(text, loaded);
	if (!merged.size) return null;

	const acronymOnly = rolesOf(open.arg.arg).includes('acronym');
	const pool = [...merged.entries()].filter(([, e]) => !acronymOnly || e.acronym);
	if (!pool.length) return null;

	const options: Completion[] = pool.map(([key, e]) => ({ label: key, detail: e.description || undefined, type: 'variable' }));
	return lastListToken({ from: ctx.pos - behind.length + open.value.at, text: open.value.value }, options);
}
