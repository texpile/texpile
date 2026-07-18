// helpers shared across completion/*.ts sources.
import { pickedCompletion, snippetCompletion, startCompletion, type Completion, type CompletionResult } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';

/** render an xparse signature ("o m") as the shape users actually recognize ("[]{}"). */
export function renderSignature(signature: string): string | undefined {
	if (!signature) return undefined;
	const parts = signature.split(/\s+/).map((tok) => {
		if (tok === 'm') return '{}';
		if (tok === 'o' || tok.startsWith('O')) return '[]';
		if (tok === 's') return '*';
		if (tok === 'v') return '||';
		if (/^[dDrR]..$/.test(tok)) return tok[1] + tok[2]; // custom delimiters, e.g. "d()" -> "()"
		if (/^t.$/.test(tok)) return tok[1]; // single-token flag, e.g. "t+" -> "+"
		return ''; // embellishments and anything exotic: not worth showing
	});
	const rendered = parts.join('');
	return rendered || undefined;
}

// macros whose accepted completion should immediately reopen the dropdown for their next
// argument (LaTeX Workshop's "post-accept auto-chain": accepting \cite reopens for the key).
// the anchored second regex is the acro/acronym short-form family (\ac, \acs, \aclp, ...).
const CHAIN_AFTER = /cite|ref|input|include|bibitem|import|gloss|gls|acr/i;
const CHAIN_ACRO = /^ac[slf]?p?$/i;

export function needsAutoChain(name: string): boolean {
	return CHAIN_AFTER.test(name) || CHAIN_ACRO.test(name);
}

/** wraps a completion's apply so accepting it reopens the completion dropdown one tick later. */
export function withAutoChain(completion: Completion): Completion {
	const baseApply = completion.apply;
	return {
		...completion,
		apply(view: EditorView, comp: Completion, from: number, to: number) {
			if (typeof baseApply === 'function') baseApply(view, comp, from, to);
			else
				view.dispatch({
					changes: { from, to, insert: comp.label },
					selection: { anchor: from + comp.label.length },
					annotations: pickedCompletion.of(comp) // keep the frecency tracker seeing this accept
				});
			// let the insert transaction settle before reopening, same tick would race CM's own state update
			setTimeout(() => startCompletion(view), 0);
		}
	};
}

/** mandatory args insert a snippet with tab stops; optional/star args are skipped for simplicity.
 * every argument-taking macro auto-chains: reopening costs nothing when no source matches at the
 * cursor (\textbf{} stays quiet), and argument slots with completions (\documentclass class
 * names, \hypersetup keys, \cite keys) open immediately instead of waiting for a keystroke. */
export function macroCompletion(name: string, signature: string): Completion {
	const mandatory = signature.split(/\s+/).filter((t) => t === 'm').length;
	const detail = renderSignature(signature);
	const base: Completion =
		mandatory === 0
			? { label: '\\' + name, type: 'function', detail }
			: snippetCompletion('\\' + name + Array.from({ length: mandatory }, (_, i) => `{\${${i + 1}}}`).join(''), {
					label: '\\' + name,
					type: 'function',
					detail
				});
	return mandatory > 0 || needsAutoChain(name) ? withAutoChain(base) : base;
}

/** completes the last comma-separated token inside a {...} or [...] key list.
 * `lenient` replaces CodeMirror's word-start fuzzy filter with case-insensitive substring
 * matching (re-queried per keystroke): in short keyword lists like package options, "a" should
 * surface "draft" and "final" the way VS Code's matcher does. */
export function lastListToken(
	match: { from: number; text: string },
	options: Completion[],
	opts: { autoChain?: boolean; lenient?: boolean } = {}
): CompletionResult | null {
	const sepAt = Math.max(match.text.lastIndexOf('{'), match.text.lastIndexOf('['), match.text.lastIndexOf(','));
	const lead = match.text.slice(sepAt + 1);
	const from = match.from + sepAt + 1 + (lead.length - lead.trimStart().length); // skip spaces after the separator
	let shown = opts.autoChain ? options.map(withAutoChain) : options;
	if (opts.lenient) {
		const typed = lead.trimStart().toLowerCase();
		if (typed) shown = shown.filter((o) => o.label.toLowerCase().includes(typed));
		if (!shown.length) return null;
		return { from, options: shown, filter: false }; // no validFor: re-query re-filters each keystroke
	}
	return {
		from,
		options: shown,
		validFor: /^[^,{}[\]\s]*$/
	};
}
