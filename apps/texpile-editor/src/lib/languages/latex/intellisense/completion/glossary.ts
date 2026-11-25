// glossary/acronym completion for the entry-label argument of \gls, \acs and the rest of the loaded glossary packages,
// sourced from the definitions in the buffer, other project files (projectIntel), and bib2gls .bib entries already
// loaded into referenceStore.
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { referenceStore } from '$lib/stores/editorStore';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { docText } from '$lib/editor/source/docText';
import { argumentAt, rolesOf } from '../../knowledge/calls/commandCalls';
import { loadedReadings } from '../../knowledge/calls/loadedReadings';
import type { LoadedFile } from '../../knowledge/loadedFiles';
import { glossaryBibTypes } from '../../knowledge/registries/glossaryBibTypes';
import { documentPackages } from '../packages/loadedPackages';
import { lastListToken } from './shared';
import { GLOSSARY_ROLES, scanGlossary, type GlossEntry } from './glossaryScan';

export { GLOSSARY_ROLES, scanGlossary, type GlossEntry };
const READ_BEHIND = 2000;
let cache: { text: string; loaded: LoadedFile[]; entries: GlossEntry[] } | null = null;

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
