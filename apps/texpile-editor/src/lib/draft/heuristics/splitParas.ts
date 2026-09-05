// Splitting a .tex buffer into prose paragraphs, and re-wrapping one paragraph as the exact
// TeX the daemon typesets. The dispatcher diffs in units of these.
import { counterBefore, lexCats } from '../engineTruth';
import { maskVerbatim, VERB_ENV_RE } from './verbatim';

export type Para = { text: string; startLine: number; wrap?: string; idx?: number; env?: string; head?: string };

// Split a .tex buffer into prose paragraphs (line-numbered), treating blank lines and
// block-level command lines (\begin, \item, \chapter, ...) as boundaries -- so the header
// line above a body paragraph isn't glued onto it.
const BLOCK_CMD =
	/^\s*\\(section|subsection|subsubsection|paragraph|subparagraph|chapter|begin|end|item|maketitle|caption|label|title|author|date|bibliography|printbibliography|tableofcontents|input|include)\b/;
function isBoundary(ln: string) {
	return ln.trim() === '' || BLOCK_CMD.test(ln);
}
// a comment-only line does NOT end a TeX paragraph: writers comment out sentences
// mid-paragraph, and the surrounding text is ONE paragraph on the page. Mid-paragraph it
// rides along verbatim (the engine's catcodes make it invisible); between paragraphs it
// stays an inert boundary line.
function isCommentLine(ln: string) {
	return /^\s*%/.test(ln);
}
const BEGIN_LIST = /^\s*\\begin\{(itemize|enumerate|description)\}/;
const END_LIST = /^\s*\\end\{(itemize|enumerate|description)\}/;
const ITEM = /^\s*\\item\b[ \t]*(.*)$/;
// environments captured WHOLE (\begin..\end as one block): the daemon can typeset a complete
// env (display math, tabular, quote), never a bare body. Lists keep per-item capture;
// document would swallow everything.
const BEGIN_ENV = /^\s*\\begin\{([a-zA-Z*]+)\}/;
// frame: beamer slide CONTENT is ordinary prose/lists on the slide's page -- capturing the
// whole frame would make every slide edit a full pass, and the daemon can't typeset a frame
// anyway (it builds a whole page). Non-beamer `frame` envs degrade safely: the locate
// ladder's content verification refuses wrong splices.
const NON_BLOCK_ENVS = new Set(['document', 'frame', 'itemize', 'enumerate', 'description']);
// sectioning lines are captured as their own single-line blocks so a title edit rides the
// instant path. \chapter (page-clearing) stays a boundary -> the debounced recompile
// handles it. \paragraph/\subparagraph are RUN-IN: TeX merges the heading into the
// following prose's first line, so the heading line and the prose after it are captured
// as ONE block -- split, neither half could ever match the page band.
const HEADING = /^\s*\\(section|subsection|subsubsection)\*?\s*[[{]/;
const RUNIN = /^\s*\\(paragraph|subparagraph)\*?\s*[[{]/;

export function splitParas(src: string): Para[] {
	return splitParaLines(src.split('\n'));
}

// same splitter over a pre-split line array: decideEdit shares ONE split of each buffer
// between here, the cut comparison and buildPatch instead of five full-doc re-splits
export function splitParaLines(lines: string[]): Para[] {
	const out: Para[] = [];
	let cur: string[] = [];
	let start = 0;
	let wrap = '';
	let idx = 0;
	let curHead = '';
	const listStack: { env: string; n: number }[] = [];
	function flush() {
		if (cur.length) out.push({ text: cur.join('\n'), startLine: start + 1, wrap: wrap || undefined, idx, head: curHead || undefined });
		cur = [];
		curHead = '';
	}
	for (let i = 0; i < lines.length; i++) {
		const ln = lines[i];
		const be = ln.match(BEGIN_ENV);
		if (be && !NON_BLOCK_ENVS.has(be[1]) && !listStack.length) {
			flush();
			const s0 = i;
			const blk: string[] = [];
			if (VERB_ENV_RE.test(be[1])) {
				// verbatim body: \begin/\end in it is TEXT, so no depth counting -- only the
				// literal closer ends it
				const closer = `\\end{${be[1]}}`;
				for (; i < lines.length; i++) {
					blk.push(lines[i]);
					if (lines[i].includes(closer)) break;
				}
			} else {
				// nesting-aware: accumulate until the matching \end (blank lines included)
				let depth = 0;
				for (; i < lines.length; i++) {
					depth += (lines[i].match(/\\begin\{[a-zA-Z*]+\}/g) || []).length;
					depth -= (lines[i].match(/\\end\{[a-zA-Z*]+\}/g) || []).length;
					blk.push(lines[i]);
					if (depth <= 0) break;
				}
			}
			out.push({ text: blk.join('\n'), startLine: s0 + 1, env: be[1] });
			continue;
		}
		const bl = ln.match(BEGIN_LIST),
			el = ln.match(END_LIST),
			im = ln.match(ITEM);
		if (bl) {
			flush();
			listStack.push({ env: bl[1], n: 0 });
			continue;
		}
		if (el) {
			flush();
			listStack.pop();
			continue;
		}
		if (im) {
			flush();
			const top = listStack[listStack.length - 1];
			if (top) top.n++;
			// an \item with no text YET still opens a paragraph. It used to open none, which
			// made a freshly typed bullet invisible to the dispatcher: both sides split to the
			// same paragraphs, so the edit read as a bare buffer difference and took the
			// debounced full pass -- the pause a writer feels on pressing Enter in a list. It
			// also lost the list wrap for `\item` written with its text on the NEXT line.
			start = i;
			cur = [im[1]];
			wrap = top ? top.env : '';
			idx = top ? top.n : 0;
			continue;
		}
		const hd = ln.match(HEADING);
		if (hd && !listStack.length) {
			flush();
			out.push({ text: ln.trim(), startLine: i + 1, head: hd[1] });
			continue;
		}
		const ri = ln.match(RUNIN);
		if (ri && !listStack.length) {
			flush();
			start = i;
			wrap = '';
			idx = 0;
			curHead = ri[1];
			cur = [ln];
			continue;
		}
		if (isCommentLine(ln)) {
			if (cur.length) cur.push(ln);
			continue;
		}
		if (isBoundary(ln)) {
			// a blank line between a run-in head and its prose does not detach them: TeX
			// holds \paragraph's box until the next paragraph starts, so keep accumulating
			// (the blank rides along for line-span accounting; wrapHead strips it)
			if (ln.trim() === '' && curHead && cur.every((l, k) => k === 0 || l.trim() === '')) {
				cur.push(ln);
				continue;
			}
			flush();
			continue;
		}
		if (!cur.length) {
			start = i;
			wrap = '';
			idx = 0;
		}
		cur.push(ln);
	}
	flush();
	return out;
}

// wrap a captured \item body back in its list env for the daemon (correct width + label).
// The counter is pinned so repeated typesets are deterministic -- the engine's own counter
// would accumulate across requests. The pin is the TRUE value from the last compile's
// counter log when it is known (the patch can then certify exact); without it the 0 pin's
// wrong digit fails exact verification and takes the full pass, which
// paints the real number. (A JS re-count of \item lines used to guess the value: deleted --
// reconstructing TeX counter state in JS is exactly the approximation we don't do.)
export function wrapItem(t: string, w?: string, line?: number, file?: string) {
	if (!w) return t;
	const pin = w === 'enumerate' && line !== undefined ? counterBefore('enumi', line, file) : null;
	const setc = w === 'enumerate' ? `\\setcounter{enumi}{${pin ?? 0}}` : '';
	return `\\begin{${w}}${setc}\\item ${t}\\end{${w}}`;
}
// comment stripping is ONLY for JS-side lexing guards (brace balance); dispatched text
// ships verbatim -- the engine's own catcodes decide what a % means. Comment chars come
// from the engine's catcode table, verbatim bodies are masked first (\url{a%b} comments
// nothing), and escape parity is tracked so "\\% comment" strips where "\%" does not.
export function stripTexComments(s: string) {
	const cats = lexCats();
	const t = maskVerbatim(s);
	let out = '';
	for (let i = 0; i < t.length; i++) {
		const c = t.charCodeAt(i);
		if (cats.escape.has(c)) {
			out += t[i];
			if (i + 1 < t.length) out += t[++i];
		} else if (cats.comment.has(c)) {
			while (i < t.length && t[i] !== '\n') i++;
			if (i < t.length) out += '\n';
		} else out += t[i];
	}
	return out;
}
// Heading dispatch prefix: the daemon's section counters accumulate across requests
// (\section{hi} renders "1 hi", then "2 hi", ...) and \@startsection's beforeskip
// depends on the leftover @nobreak state -- both nondeterministic. Pin the counters and
// force @nobreak so every typeset of the same heading is identical. Pins are the TRUE
// values from the last compile's counter log when known -- the heading then reproduces
// the page exactly and the patch certifies; the fixed fallbacks render a wrong number
// that fails verification and takes the full pass.
const HEAD_CHAIN: Record<string, string[]> = {
	section: ['section'],
	subsection: ['section', 'subsection'],
	subsubsection: ['section', 'subsection', 'subsubsection'],
	// run-in levels print no number at default secnumdepth; pinned anyway for docs that raise it
	paragraph: ['section', 'subsection', 'subsubsection', 'paragraph'],
	subparagraph: ['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph']
};
function headPins(head: string, line?: number, file?: string): string {
	const chain = HEAD_CHAIN[head];
	if (!chain) return '';
	// the head's own counter pins to the value BEFORE its step (the \section steps it);
	// parents pin to their standing value
	return chain
		.map((c, k) => {
			const trueV = line !== undefined ? counterBefore(c, line, file) : null;
			return `\\setcounter{${c}}{${trueV ?? (k === chain.length - 1 ? 0 : 1)}}`;
		})
		.join('');
}
// blank lines inside a head para (run-in head, blank, prose) are stripped for the daemon:
// TeX attaches the head across them, and a shipped \par would detach it
export function wrapHead(t: string, head?: string, line?: number, file?: string) {
	return head
		? `\\makeatletter\\@nobreaktrue\\makeatother${headPins(head, line, file)}${t
				.split('\n')
				.filter((l) => l.trim() !== '')
				.join('\n')}`
		: t;
}
// a Para as the daemon should typeset it (list items re-wrapped, headings pinned)
export function paraTex(p: Para, file?: string) {
	return wrapHead(wrapItem(p.text, p.wrap, p.startLine, file), p.head, p.startLine, file);
}

// While typing you pass through unbalanced states (\textbf{ before the }, $ before its
// close). An unclosed brace group has no paragraph terminator, so the daemon's typeset
// never finishes -- it blocks the full 6s timeout, then SIGKILLs and cold-respawns the
// engine. So only fire the instant patch once groups and inline math are balanced.
// (Lexes over comment-stripped text; braces inside comments aren't grouping.)
