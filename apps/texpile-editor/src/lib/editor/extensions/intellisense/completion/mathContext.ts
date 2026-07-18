// math-context detection for completion ranking. a heuristic forward scan over a bounded window
// (the stex StreamLanguage tree has no math scope to ask), tracking $/$$, \(/\), \[/\] and math
// environments. boosts math-flagged macros inside math and sinks them slightly outside; never
// filters, so a wrong guess degrades to LaTeX Workshop's flat ordering instead of a missing entry.
import type { Completion } from '@codemirror/autocomplete';
import type { EditorState } from '@codemirror/state';
import { MATH_MACRO_LABELS } from './macros';

const WINDOW = 4000;
const MATH_ENVS =
	/^(?:equation|align|alignat|flalign|gather|multline|eqnarray|math|displaymath|aligned|alignedat|gathered|split|cases|d?cases|array|(?:small|p|b|B|v|V)?matrix|subarray|xalignat|xxalignat)\*?$/;

// \\ first so a linebreak never swallows the backslash of an escaped \$; then escapes, then the rest
const TOKEN = /\\\\|\\[$%]|\\([[\]()])|\\(begin|end)\{([a-zA-Z*]+)\}|\$\$?|%[^\n]*/g;

/** true when pos sits inside $...$, \(...\), \[...\], $$...$$ or a math environment. */
export function isMathContext(state: EditorState, pos: number): boolean {
	const text = state.sliceDoc(Math.max(0, pos - WINDOW), pos);
	let envDepth = 0;
	let inline = false;
	let display = false;
	TOKEN.lastIndex = 0;
	for (let m = TOKEN.exec(text); m; m = TOKEN.exec(text)) {
		const tok = m[0];
		if (tok === '\\\\' || tok === '\\$' || tok === '\\%' || tok[0] === '%') continue;
		if (m[1]) {
			if (m[1] === '(') inline = true;
			else if (m[1] === ')') inline = false;
			else if (m[1] === '[') display = true;
			else display = false;
		} else if (m[2]) {
			if (!MATH_ENVS.test(m[3])) continue;
			if (m[2] === 'begin') envDepth++;
			else envDepth = Math.max(0, envDepth - 1);
		} else if (tok === '$$') display = !display;
		else if (tok === '$') inline = !inline;
	}
	return envDepth > 0 || inline || display;
}

const IN_MATH_BOOST = 12;
const OUT_OF_MATH_SINK = -6;

/** re-ranks math-flagged macro completions for the given context; composes with frecency boosts. */
export function withMathBoost(options: Completion[], inMath: boolean): Completion[] {
	const delta = inMath ? IN_MATH_BOOST : OUT_OF_MATH_SINK;
	return options.map((o) => (MATH_MACRO_LABELS.has(o.label) ? { ...o, boost: (o.boost ?? 0) + delta } : o));
}
