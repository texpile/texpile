// \ref-family completion: labelStore (the active buffer's \label{}s via extractDocRefs), a light
// supplementary scan for the \begin{fig}[label=name] key-value form, labels from every other
// project file (projectIntel), and resolved numbers from the main .aux when one exists.
import { get } from 'svelte/store';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { labelStore } from '$lib/stores/editorStore';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { lastListToken } from './shared';

// any macro containing "ref" (LW's generic trigger, so \zref/\vpageref/\namecref/user \fooref all
// work), plus \hyperref[...] and \crefrange{a}{b}'s second arg. NOT_REFS keeps \href/\hyperref's
// url/text args from being offered labels (a false-fire LW itself has).
const REF_BEFORE =
	/(?:\\hyperref\[[^\]]*$)|(?:\\([a-zA-Z]*ref[a-zA-Z]*)\*?(?:\[[^\]]*\])?\{[^{}]*$)|(?:\\[Cc]refrange\*?\{[^{}]*\}\{[^{}]*$)/;
const NOT_REFS = new Set(['href', 'hyperref', 'crossref', 'refstepcounter', 'reflectbox']);

// label=name (or {name}) inside an environment's optional key-value args, e.g.
// \begin{figure}[label=fig:x]. enumerate/itemize excluded: enumitem's label= option styles list
// markers, it isn't a cross-reference.
const KEYVAL_LABEL = /label\s*=\s*(?:\{([^}]+)\}|([^,\]}\s]+))/g;
const NON_REF_ENVS = /\\begin\{\s*(?:itemize|enumerate)\s*\}/;

function keyValueLabels(text: string): string[] {
	const out: string[] = [];
	// cheap guard: skip the scan entirely if there's no "label=" anywhere in the buffer
	if (!text.includes('label')) return out;
	let m: RegExpExecArray | null;
	KEYVAL_LABEL.lastIndex = 0;
	while ((m = KEYVAL_LABEL.exec(text))) {
		// the label= itself might sit inside an itemize/enumerate optional-arg styling option;
		// a precise check would need brace matching, this cheap nearby-context check is enough
		// for the common false-positive shape (enumitem's label={...} right after \begin{itemize}).
		const before = text.slice(Math.max(0, m.index - 60), m.index);
		if (NON_REF_ENVS.test(before)) continue;
		const key = (m[1] ?? m[2] ?? '').trim();
		if (key) out.push(key);
	}
	return out;
}

/** labelStore plus any label= key-value labels found in the current buffer text. */
export function allLabels(bufferText: string): string[] {
	const fromStore = get(labelStore) ?? [];
	const fromKeyVal = keyValueLabels(bufferText);
	return fromKeyVal.length ? [...new Set([...fromStore, ...fromKeyVal])] : fromStore;
}

export function referenceCompletionSource(ctx: CompletionContext): CompletionResult | null {
	const ref = ctx.matchBefore(REF_BEFORE);
	if (!ref) return null;
	// only the {…}-arg branch gets the exclusion: \hyperref[…] (labels) must stay, \hyperref{…}
	// and \href{…} (url/text args) must not
	const braceArg = /\\([a-zA-Z]+)\*?(?:\[[^\]]*\])?\{[^{}]*$/.exec(ref.text);
	if (braceArg && NOT_REFS.has(braceArg[1])) return null;
	const intel = get(projectIntelStore);
	const basename = (p: string) => p.replace(/\\/g, '/').split('/').pop() ?? p;
	const detailOf = (name: string, from?: string): string | undefined => {
		const num = intel.auxNumbers[name];
		const page = intel.auxPages[name];
		const resolved = num ? `${num}${page ? `, p.${page}` : ''}` : '';
		return [resolved, from].filter(Boolean).join(' · ') || undefined;
	};
	const seen = new Set<string>();
	const options: Completion[] = [];
	for (const l of allLabels(ctx.state.doc.toString())) {
		seen.add(l);
		options.push({ label: l, type: 'variable', detail: detailOf(l) });
	}
	for (const l of intel.labels) {
		if (seen.has(l.name)) continue;
		seen.add(l.name);
		options.push({ label: l.name, type: 'variable', detail: detailOf(l.name, basename(l.file)) });
	}
	if (!options.length) return null;
	return lastListToken(ref, options);
}
