// Is the caret inside a list, and inside one of its items? Everything that decides whether
// Enter continues a list lives here, as a pure function over the buffer, because the cost of
// being wrong is asymmetric: failing to add a bullet is a keystroke, adding one into a tabular
// or a verbatim block corrupts the document under the writer's hands.
//
// The scan is deliberately literal rather than clever. It walks the buffer once and only
// believes a \begin or \end it can see is really code: comments are skipped to end of line,
// verbatim-family bodies are skipped whole (a \begin{itemize} printed inside lstlisting is
// text, not a list), and escapes are counted so \% and \\ read correctly.

const LIST_ENVS = new Set(['itemize', 'enumerate', 'description']);
// bodies whose content is literal: nothing inside them is a command, so the only thing that
// can close one is its own literal \end
const VERBATIM_ENVS = new Set(['verbatim', 'Verbatim', 'lstlisting', 'minted', 'alltt', 'comment', 'listing']);

export type OpenList = {
	env: string;
	/** offset just past the last \item of this list before the caret (a result only exists
	 *  when there IS one -- a caret above the first item is not inside an item) */
	itemAt: number;
};

/** true when the backslash at `i` is itself escaped (\\% is a comment, \% is not) */
function escaped(doc: string, i: number): boolean {
	let n = 0;
	for (let k = i - 1; k >= 0 && doc[k] === '\\'; k--) n++;
	return n % 2 === 1;
}

const NAME = /^\\(begin|end)\{([a-zA-Z@]+\*?)\}/;
const ITEM = /^\\item\b/;

/**
 * The innermost environment open at `pos`, when it is a list AND the caret sits inside one of
 * its items. Anything else -- a tabular or equation nested in the list, a verbatim body, a
 * position between \begin{itemize} and its first \item -- returns null.
 */
export function openListAt(doc: string, pos: number): OpenList | null {
	const stack: { env: string; itemAt: number | null }[] = [];
	let i = 0;
	while (i < pos) {
		const c = doc[i];
		// a comment runs to the end of the line, and nothing in it is code
		if (c === '%' && !escaped(doc, i)) {
			const nl = doc.indexOf('\n', i);
			if (nl < 0 || nl >= pos) return frameOf(stack);
			i = nl + 1;
			continue;
		}
		if (c !== '\\') {
			i++;
			continue;
		}
		if (escaped(doc, i)) {
			i += 2;
			continue;
		}
		const rest = doc.slice(i, i + 64);
		const m = NAME.exec(rest);
		if (m) {
			const [, kind, env] = m;
			if (kind === 'begin') {
				// a verbatim body ends only at its own literal \end: skip the whole thing so a
				// \begin{itemize} PRINTED inside it never opens a list
				if (VERBATIM_ENVS.has(env)) {
					const close = doc.indexOf(`\\end{${env}}`, i);
					if (close < 0 || close >= pos) return null; // caret is inside literal text
					i = close + `\\end{${env}}`.length;
					continue;
				}
				stack.push({ env, itemAt: null });
			} else if (stack.length && stack[stack.length - 1].env === env) {
				stack.pop();
			} else {
				// an \end that does not match the innermost open env: the buffer is mid-edit or
				// malformed, and guessing which env it closes is exactly the guess to refuse
				return null;
			}
			i += m[0].length;
			continue;
		}
		if (ITEM.test(rest)) {
			const top = stack[stack.length - 1];
			// an \item outside any list, or inside a non-list env, says the buffer is not in a
			// shape this feature should act on
			if (!top || !LIST_ENVS.has(top.env)) return null;
			i += 5;
			top.itemAt = i;
			continue;
		}
		i++;
	}
	return frameOf(stack);
}

function frameOf(stack: { env: string; itemAt: number | null }[]): OpenList | null {
	const top = stack[stack.length - 1];
	// innermost only: a tabular or an equation opened inside the list is where the caret
	// actually is, and Enter there has nothing to do with bullets
	if (!top || !LIST_ENVS.has(top.env) || top.itemAt === null) return null;
	return { env: top.env, itemAt: top.itemAt };
}

/** unescaped `$` count before `pos` on its own line -- odd means the caret sits inside math */
export function inInlineMath(line: string, col: number): boolean {
	let n = 0;
	for (let i = 0; i < col && i < line.length; i++) if (line[i] === '$' && !escaped(line, i)) n++;
	return n % 2 === 1;
}

const OPENS_LIST = /^\s*\\begin\{(itemize|enumerate|description)\}/;
const ANY_BEGIN = /\\begin\{/;
const ANY_END = /\\end\{/;
const HAS_ITEM = /^\s*\\item\b/;
// a wrapped item is a handful of lines, never fifty: the cap bounds the walk on a buffer
// whose structure is mid-edit and makes no sense
const MAX_WALK = 40;

/**
 * The local reading, required ON TOP of the document scan: walking up from the caret, the
 * first thing that matters must be this item's own `\item` or the list's `\begin`, reached
 * without crossing an `\end`, another environment's `\begin`, or a blank line. The scan alone
 * already answers "which environment am I in"; this answers "am I plainly at the end of a
 * bullet", and a bullet is only added when both say yes.
 */
export function itemLineAbove(lines: string[], lineIdx: number): boolean {
	for (let i = lineIdx, n = 0; i >= 0 && n < MAX_WALK; i--, n++) {
		const ln = lines[i];
		if (HAS_ITEM.test(ln)) return true;
		if (OPENS_LIST.test(ln)) return true;
		// anything structural between the caret and its bullet: a closed environment, a new
		// one opened, or a paragraph break. None of them leave the caret inside a bullet.
		if (ANY_END.test(ln) || ANY_BEGIN.test(ln)) return false;
		if (i !== lineIdx && ln.trim() === '') return false;
	}
	return false;
}
