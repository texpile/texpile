// subscript/superscript completion: mines every ^{...} / _{...} already used in the buffer and
// the other project files (projectIntel) and offers them again — a pure repetition aid, no
// bundled data (LW mines the same set from its include-tree AST).
import { get } from 'svelte/store';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { projectIntelStore } from '$lib/stores/projectIntel';

const SCRIPT_TRIGGER = /[\^_]\{[^{}]*$/;
const SCRIPT_START = /[\^_]\{/g;

const MAX_SCAN_LENGTH = 2_000_000;
const MAX_SCRIPT_LENGTH = 120; // a "script" longer than this is a mining artifact, not a reusable one
let cache: { text: string; sub: string[]; sup: string[] } | null = null;

// balanced-brace walk so nested groups mine whole (^{\mathrm{T}}, _{a_{b}}); the old single-level
// regex stopped at the first inner }. also feeds the cross-file project scan.
export function scanScripts(text: string): { sub: string[]; sup: string[] } {
	if (text.length > MAX_SCAN_LENGTH) return { sub: [], sup: [] };
	const sub = new Set<string>();
	const sup = new Set<string>();
	SCRIPT_START.lastIndex = 0;
	for (let m = SCRIPT_START.exec(text); m; m = SCRIPT_START.exec(text)) {
		let depth = 1;
		let i = m.index + 2;
		while (i < text.length && depth > 0 && i - m.index <= MAX_SCRIPT_LENGTH) {
			const ch = text[i];
			if (ch === '\\')
				i++; // skip escaped braces
			else if (ch === '{') depth++;
			else if (ch === '}') depth--;
			i++;
		}
		if (depth !== 0) continue;
		const content = text.slice(m.index + 2, i - 1);
		if (content) (text[m.index] === '^' ? sup : sub).add(content);
	}
	return { sub: [...sub], sup: [...sup] };
}

export function subsuperscriptCompletionSource(ctx: CompletionContext): CompletionResult | null {
	const match = ctx.matchBefore(SCRIPT_TRIGGER);
	if (!match) return null;
	const text = ctx.state.doc.toString();
	if (!cache || cache.text !== text) cache = { text, ...scanScripts(text) };
	const isSup = match.text.startsWith('^');
	const intel = get(projectIntelStore);
	const values = [...new Set(isSup ? [...cache.sup, ...intel.sup] : [...cache.sub, ...intel.sub])];
	if (!values.length) return null;
	const options: Completion[] = values.map((v) => ({ label: v, type: 'text' }));
	return { from: match.from + 2, options, validFor: /^[^{}]*$/ };
}
