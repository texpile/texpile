/* eslint id-denylist: "off" -- "info" here is @codemirror/autocomplete's Completion field */
// \command completion: what the document's packages define, LaTeX Workshop's forms (data/macroForms.ts), and the
// user's OWN \newcommand/\NewDocumentCommand definitions scanned from the buffer in userMacros.worker.ts (LaTeX
// Workshop calls this "user-defined macros"; the scan itself lives in userMacroScan.ts) and from the project
import { snippetCompletion, type Completion } from '@codemirror/autocomplete';
import { projectIntelStore, type ProjectIntel } from '$lib/stores/projectIntel';
import { extractUserMacrosAsync } from './userMacrosClient';
import { extractUserMacros, type UserMacroDef } from './userMacroScan';
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

let cache: { text: string; options: Completion[] } | null = null;
let pendingText: string | null = null;
let debounceId: ReturnType<typeof setTimeout> | null = null;

// worker results are plain name/signature pairs; the Completions (which carry apply fns and
// can't cross the worker boundary) are built here
function userMacroCompletions(defs: UserMacroDef[]): Completion[] {
	return defs.map(({ name, signature }) => ({
		...macroCompletion(name, signature),
		detail: `${renderUserDetail(signature)} (defined in this file)`
	}));
}

// stale-while-revalidate: the buffer scan parses the whole file (seconds at 1MB), so it runs in
// userMacros.worker.ts after a short pause and the cache swaps when the result lands
function scheduleRefresh(text: string) {
	if (pendingText === text) return; // already debouncing or in flight for this exact version
	// no Worker (vitest/node): scan inline so the caller sees the result in this same call
	if (typeof Worker === 'undefined') {
		cache = { text, options: userMacroCompletions(extractUserMacros(text)) };
		return;
	}
	pendingText = text;
	if (debounceId != null) clearTimeout(debounceId);
	debounceId = setTimeout(() => {
		debounceId = null;
		void extractUserMacrosAsync(text).then((defs) => {
			if (pendingText === text) pendingText = null; // settled or failed: a later call may retry this text
			if (defs) cache = { text, options: userMacroCompletions(defs) };
		});
	}, 300);
}

function renderUserDetail(signature: string): string {
	const mandatory = signature.split(/\s+/).filter((t) => t === 'm').length;
	return mandatory ? '{}'.repeat(mandatory) : '';
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
