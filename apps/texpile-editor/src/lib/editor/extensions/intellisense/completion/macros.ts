// \command completion: the bundled CTAN signature DB (same one the parser uses), LaTeX Workshop's
// vendored default set (data/lwMacros.ts), and the user's OWN \newcommand/\NewDocumentCommand
// definitions scanned from the buffer in userMacros.worker.ts (LaTeX Workshop calls this
// "user-defined macros"; the scan itself lives in userMacroScan.ts, not a bespoke scanner here).
import { get } from 'svelte/store';
import { snippetCompletion, type Completion } from '@codemirror/autocomplete';
import { macroInfo } from '@unified-latex/unified-latex-ctan';
import { projectIntelStore, type ProjectIntel } from '$lib/stores/projectIntel';
import { extractUserMacrosAsync } from './userMacrosClient';
import { extractUserMacros, type UserMacroDef } from './userMacroScan';
import { macroCompletion, withAutoChain } from './shared';
import { withFrecency } from './frecency';
import { ENV_AS_MACRO_OPTIONS } from './environments';
import { LW_MACROS, type LwMacro } from '../data/lwMacros';
import { TEX_MACROS } from '../data/texMacros';

type InfoMap = Record<string, Record<string, { signature?: string }>>;

// flatten per-package CTAN records to name/signature; first definition wins
function collectSignatures(info: InfoMap, extra: Record<string, string> = {}): Map<string, string> {
	const out = new Map<string, string>();
	for (const pkg of Object.values(info))
		for (const [name, def] of Object.entries(pkg)) if (!out.has(name)) out.set(name, def.signature ?? '');
	for (const [name, sig] of Object.entries(extra)) if (!out.has(name)) out.set(name, sig);
	return out;
}

// amsmath/amssymb constructs the bundled packages may omit; keep this tiny
const EXTRA_MACROS: Record<string, string> = {
	text: 'm',
	eqref: 'm',
	mathbb: 'm',
	mathcal: 'm',
	mathbf: 'm',
	mathrm: 'm',
	boldsymbol: 'm',
	DeclareMathOperator: 'm m'
};

const STATIC_SIGNATURES = collectSignatures(macroInfo as InfoMap, EXTRA_MACROS);
const STATIC_NAMES = new Set(STATIC_SIGNATURES.keys());

// \end mirrors the vendored \begin: insert "\end{" and chain into the environment-name list
const END_MACRO: LwMacro = { label: 'end', snippet: 'end{', detail: 'End an environment', chain: true };

function lwCompletion(m: LwMacro): Completion {
	const base: Completion = m.snippet
		? snippetCompletion('\\' + m.snippet, { label: '\\' + m.label, type: 'function', detail: m.detail, info: m.info })
		: { label: '\\' + m.label, type: 'function', detail: m.detail, info: m.info };
	// snippets with fields chain like macroCompletion does: silent unless a source matches
	return m.chain || (m.snippet?.includes('${') ?? false) ? withAutoChain(base) : base;
}

const LW_OPTIONS: Completion[] = [...LW_MACROS, END_MACRO]
	.filter((m) => !STATIC_NAMES.has(m.label)) // guard against future unified-latex DB growth
	.map(lwCompletion);
const LW_NAMES = new Set(LW_MACROS.map((m) => m.label));

const TEX_OPTIONS: Completion[] = TEX_MACROS.filter((m) => !STATIC_NAMES.has(m.label) && !LW_NAMES.has(m.label)).map(lwCompletion);

// CTAN-DB macros that belong to math input, for the same context boost as the flagged vendored sets
const CTAN_MATH_NAMES = [
	'frac',
	'sqrt',
	'binom',
	'dfrac',
	'tfrac',
	'cfrac',
	'overbrace',
	'underbrace',
	'stackrel',
	'substack',
	'operatorname',
	'mathbb',
	'mathcal',
	'mathbf',
	'mathrm',
	'mathsf',
	'mathit',
	'mathtt',
	'mathfrak',
	'boldsymbol',
	'text'
];

/** labels ("\name") whose completions get boosted inside math context. */
export const MATH_MACRO_LABELS: Set<string> = new Set(
	[...[...LW_MACROS, ...TEX_MACROS].filter((m) => m.math).map((m) => m.label), ...CTAN_MATH_NAMES.filter((n) => STATIC_NAMES.has(n))].map(
		(n) => '\\' + n
	)
);

// unique by label; env-as-macro snippets outrank the archaic plain-TeX forms of the same name
// (\matrix, \cases ride the amsmath environments, not the TeX primitives)
export const STATIC_MACRO_OPTIONS: Completion[] = (() => {
	const seen = new Set<string>();
	const uniq = (options: Completion[]) => options.filter((o) => !seen.has(o.label) && (seen.add(o.label), true));
	return [
		...uniq([...STATIC_SIGNATURES].map(([name, sig]) => macroCompletion(name, sig))),
		...uniq(LW_OPTIONS),
		...uniq(ENV_AS_MACRO_OPTIONS),
		...uniq(TEX_OPTIONS)
	];
})();

let cache: { text: string; options: Completion[] } | null = null;
let pendingText: string | null = null;
let debounceId: ReturnType<typeof setTimeout> | null = null;

// worker results are plain name/signature pairs; the Completions (which carry apply fns and
// can't cross the worker boundary) are built here
function userMacroCompletions(defs: UserMacroDef[]): Completion[] {
	const out: Completion[] = [];
	for (const { name, signature } of defs) {
		// skip names the static DB already documents ("avoid over populating suggestions")
		if (STATIC_NAMES.has(name) || LW_NAMES.has(name)) continue;
		out.push({ ...macroCompletion(name, signature), detail: `${renderUserDetail(signature)} (defined in this file)` });
	}
	return out;
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
	const intel = get(projectIntelStore);
	if (intelCache?.intel !== intel) {
		const seen = new Set<string>();
		const options: Completion[] = [];
		for (const m of intel.macros) {
			if (STATIC_NAMES.has(m.name) || LW_NAMES.has(m.name) || seen.has(m.name)) continue;
			seen.add(m.name);
			const from = m.file.replace(/\\/g, '/').split('/').pop() ?? m.file;
			options.push({ ...macroCompletion(m.name, m.signature), detail: `${renderUserDetail(m.signature)} (${from})` });
		}
		intelCache = { intel, options };
	}
	return intelCache.options;
}

/** static + user-defined (buffer and project-wide) macro completions, frecency-boosted.
 * buffer definitions are served from the last finished worker scan, so after an edit they can
 * lag by the debounce plus parse time; static/project options are always current. */
export function macroOptions(text: string): Completion[] {
	if (cache?.text !== text) scheduleRefresh(text); // docText makes this a reference compare
	const buffer = cache?.options ?? [];
	const bufferNames = new Set(buffer.map((o) => o.label));
	const project = projectMacroOptions().filter((o) => !bufferNames.has(o.label));
	return withFrecency([...STATIC_MACRO_OPTIONS, ...buffer, ...project]);
}

/** looks up a macro's completion by name, for hover. null means "not a recognized macro". */
export function macroLookup(text: string, name: string): { detail?: string; info?: string } | null {
	const found = macroOptions(text).find((o) => o.label === '\\' + name);
	return found ? { detail: found.detail as string | undefined, info: typeof found.info === 'string' ? found.info : undefined } : null;
}
