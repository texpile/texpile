/* eslint id-denylist: "off" -- "info" here is @codemirror/autocomplete's Completion field */
// \command completion: what the document's packages define, LaTeX Workshop's forms (data/macroForms.ts), and the
// user's OWN \newcommand/\NewDocumentCommand definitions scanned from the buffer in userMacros.worker.ts (LaTeX
// Workshop calls this "user-defined macros"; the scan itself lives in userMacroScan.ts) and from the project
import { snippetCompletion, type Completion } from '@codemirror/autocomplete';
import { projectIntelStore, type ProjectIntel } from '$lib/stores/projectIntel';
import { extractUserDefinitionsAsync } from './userMacrosClient';
import { extractUserDefinitions, type UserDefinitions } from './userMacroScan';
import { macroCompletion, withAutoChain } from './shared';
import { withFrecency } from './frecency';
import { environmentMacroOptions } from './environments';
import { MACRO_FORMS, type MacroForm } from '../data/macroForms';
import { documentPackages, type LoadedFile } from '../packages/loadedPackages';
import { packageCompletions, type MacroCompletion } from '../packages/packageCompletions';
import { packageSuggestions } from '../packages/packageSuggestions';

function formCompletion(m: MacroForm): MacroCompletion {
	const base = snippetCompletion('\\' + m.snippet, { label: '\\' + m.label, type: 'function', detail: m.detail });
	// snippets with fields chain like macroCompletion does: silent unless a source matches
	const option: MacroCompletion = m.chain || m.snippet.includes('${') ? withAutoChain(base) : base;
	if (m.math) option.math = true;
	return option;
}

const FORM_OPTIONS = MACRO_FORMS.map(formCompletion);
const FORM_LABELS = new Set(FORM_OPTIONS.map((o) => o.label));

type Cache = { text: string; options: Completion[]; signatures: Map<string, string>; definitions: UserDefinitions };
let cache: Cache | null = null;
let pendingText: string | null = null;
let debounceId: ReturnType<typeof setTimeout> | null = null;

// worker results are plain name/signature pairs; the Completions (which carry apply fns and
// can't cross the worker boundary) are built here
function userMacroCompletions(defs: UserDefinitions['macros']): Completion[] {
	return defs.map(({ name, signature }) => ({
		...macroCompletion(name, signature),
		detail: `${renderUserDetail(signature)} (defined in this file)`
	}));
}

function cacheOf(text: string, defs: UserDefinitions): Cache {
	return { text, options: userMacroCompletions(defs.macros), signatures: signaturesOf(defs.macros), definitions: defs };
}

function signaturesOf(defs: UserDefinitions['macros']): Map<string, string> {
	return new Map(defs.map((d) => [d.name, d.signature]));
}

// about 15 ms at 30 KB, run once per change
const INLINE_SCAN_LIMIT = 30_000;

// stale-while-revalidate: the buffer scan parses the whole file (seconds at 1MB), so it runs in
// userMacros.worker.ts after a short pause and the cache swaps when the result lands
function scheduleRefresh(text: string) {
	if (pendingText === text) return; // already debouncing or in flight for this exact version
	// a small file scans inline, so a command typed a moment ago is known and another file's scan never stands in
	// for this one's; no Worker (vitest/node) does the same
	if (typeof Worker === 'undefined' || text.length <= INLINE_SCAN_LIMIT) {
		const defs = extractUserDefinitions(text);
		cache = cacheOf(text, defs);
		return;
	}
	pendingText = text;
	if (debounceId != null) clearTimeout(debounceId);
	debounceId = setTimeout(() => {
		debounceId = null;
		void extractUserDefinitionsAsync(text).then((defs) => {
			if (pendingText === text) pendingText = null; // settled or failed: a later call may retry this text
			if (defs) cache = cacheOf(text, defs);
		});
	}, 300);
}

function renderUserDetail(signature: string): string {
	return signature
		.split(/\s+/)
		.map((t) => (t === 'm' ? '{}' : /^[oO]/.test(t) ? '[]' : ''))
		.join('');
}

let intelCache: { intel: ProjectIntel; options: Completion[] } | null = null;

// \newcommand-family definitions from OTHER project files (the buffer's own come from the worker scan)
function projectMacroOptions(): Completion[] {
	const intel = projectIntelStore.current;
	if (intelCache?.intel !== intel) {
		const seen = new Set<string>();
		const options: Completion[] = [];
		for (const m of intel.macros) {
			if (seen.has(m.name)) continue;
			seen.add(m.name);
			const from = m.file.replace(/\\/g, '/').split('/').pop() ?? m.file;
			options.push({ ...macroCompletion(m.name, m.signature), detail: `${renderUserDetail(m.signature)} (${from})` });
		}
		intelCache = { intel, options };
	}
	return intelCache.options;
}

// a name a package defines keeps its entry; buffer definitions lag an edit by the worker scan's debounce and parse
async function knownMacroOptions(text: string): Promise<{ options: MacroCompletion[]; loaded: LoadedFile[]; taken: Set<string> }> {
	if (cache?.text !== text) scheduleRefresh(text); // docText makes this a reference compare
	const loaded = await documentPackages(text);
	const packages = packageCompletions(loaded);
	const taken = new Set([...FORM_LABELS, ...packages.labels]);
	function unseen(options: Completion[]): Completion[] {
		return options.filter((o) => !taken.has(o.label) && (taken.add(o.label), true));
	}
	const options = [
		...FORM_OPTIONS,
		...packages.macros.filter((o) => !FORM_LABELS.has(o.label)),
		...unseen(environmentMacroOptions(packages.envs)),
		...unseen(cache?.options ?? []),
		...unseen(projectMacroOptions())
	];
	return { options, loaded, taken };
}

/** every command completion, frecency-boosted, the unloaded common packages' last */
export async function macroOptions(text: string): Promise<MacroCompletion[]> {
	const { options, loaded, taken } = await knownMacroOptions(text);
	const suggested = (await packageSuggestions(loaded, text)).macros.filter((o) => !taken.has(o.label) && (taken.add(o.label), true));
	return withFrecency([...options, ...suggested]);
}

/** looks up a macro's completion by name, for hover. null means "not a recognized macro". */
export async function macroLookup(text: string, name: string): Promise<{ detail?: string; info?: string } | null> {
	const found = (await knownMacroOptions(text)).options.find((o) => o.label === '\\' + name);
	return found ? { detail: found.detail as string | undefined, info: typeof found.info === 'string' ? found.info : undefined } : null;
}

/** the xparse signature ("o m") of a macro the buffer or the project defines, null for any other name */
export function userMacroSignature(text: string, name: string): string | null {
	if (cache?.text !== text) scheduleRefresh(text);
	return cache?.signatures.get(name) ?? projectIntelStore.current.macros.find((m) => m.name === name)?.signature ?? null;
}

/** the macros and environments the buffer defines that carry math delimiters; an earlier scan until the new one lands */
export function userDefinitionsOf(text: string): UserDefinitions | null {
	if (cache?.text !== text) scheduleRefresh(text);
	return cache?.definitions ?? null;
}

/** the xparse signature of an environment the buffer or the project defines, null for any other name */
export function userEnvironmentSignature(text: string, name: string): string | null {
	return (
		userDefinitionsOf(text)?.environments.find((e) => e.name === name)?.signature ??
		projectIntelStore.current.envs.find((e) => e.name === name)?.signature ??
		null
	);
}
