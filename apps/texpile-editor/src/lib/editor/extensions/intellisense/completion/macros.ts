// \command completion: the bundled CTAN signature DB (same one the parser uses), LaTeX Workshop's
// vendored default set (data/lwMacros.ts), and the user's OWN \newcommand/\NewDocumentCommand
// definitions scanned live from the buffer (LaTeX Workshop calls this "user-defined macros"; here
// it's listNewcommands reused from the parser's own converter.ts, not a bespoke scanner).
import { get } from 'svelte/store';
import { snippetCompletion, type Completion } from '@codemirror/autocomplete';
import { macroInfo } from '@unified-latex/unified-latex-ctan';
import { listNewcommands } from '@unified-latex/unified-latex-util-macros';
import { parseLatex } from '$lib/latex-parser/parser';
import { MACRO_SIGNATURES, ENV_SIGNATURES } from '$lib/latex-parser/macros';
import { projectIntelStore, type ProjectIntel } from '$lib/stores/projectIntel';
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

const MAX_SCAN_LENGTH = 2_000_000; // guards against re-parsing megabytes per keystroke
let cache: { text: string; options: Completion[] } | null = null;

// definition forms listNewcommands doesn't cover (LW parses these in macro.ts parse())
const EXTRA_DEF_PATTERNS: Array<{ re: RegExp; sig: (m: RegExpExecArray) => string }> = [
	{ re: /\\DeclareMathOperator\*?\{\\([a-zA-Z@]+)\}/g, sig: () => '' },
	{ re: /\\DeclarePairedDelimiter(?:XPP|X)?\{?\\([a-zA-Z@]+)\}?/g, sig: () => 'm' },
	{ re: /\\(?:(?:re)?newrobustcmd|DeclareRobustCommand)\*?\{\\([a-zA-Z@]+)\}(?:\[(\d)\])?/g, sig: (m) => 'm '.repeat(+(m[2] ?? 0)).trim() }
];

function computeUserMacros(text: string): Completion[] {
	if (text.length > MAX_SCAN_LENGTH) return [];
	const seen = new Set<string>();
	const out: Completion[] = [];
	const add = (name: string, signature: string) => {
		// skip names the static DB already documents ("avoid over populating suggestions")
		if (STATIC_NAMES.has(name) || LW_NAMES.has(name) || seen.has(name)) return;
		seen.add(name);
		out.push({ ...macroCompletion(name, signature), detail: `${renderUserDetail(signature)} (defined in this file)` });
	};
	try {
		const ast = parseLatex(text, { macros: MACRO_SIGNATURES, environments: ENV_SIGNATURES });
		for (const m of listNewcommands(ast)) add(m.name, m.signature);
	} catch {
		// unparseable mid-edit buffer: static + regex-scanned completions still work
	}
	for (const { re, sig } of EXTRA_DEF_PATTERNS) {
		re.lastIndex = 0;
		for (let m = re.exec(text); m; m = re.exec(text)) add(m[1], sig(m));
	}
	return out;
}

function renderUserDetail(signature: string): string {
	const mandatory = signature.split(/\s+/).filter((t) => t === 'm').length;
	return mandatory ? '{}'.repeat(mandatory) : '';
}

let intelCache: { intel: ProjectIntel; options: Completion[] } | null = null;

// \newcommand-family definitions from OTHER project files (the buffer's own are in computeUserMacros)
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

/** static + user-defined (buffer and project-wide) macro completions, frecency-boosted. */
export function macroOptions(text: string): Completion[] {
	if (!cache || cache.text !== text) cache = { text, options: computeUserMacros(text) };
	const bufferNames = new Set(cache.options.map((o) => o.label));
	const project = projectMacroOptions().filter((o) => !bufferNames.has(o.label));
	return withFrecency([...STATIC_MACRO_OPTIONS, ...cache.options, ...project]);
}

/** looks up a macro's completion by name, for hover. null means "not a recognized macro". */
export function macroLookup(text: string, name: string): { detail?: string; info?: string } | null {
	const found = macroOptions(text).find((o) => o.label === '\\' + name);
	return found ? { detail: found.detail as string | undefined, info: typeof found.info === 'string' ? found.info : undefined } : null;
}
