// Decides WHAT TO ASK THE ENGINE for each buffer edit -- nothing else. Pure functions
// (no Svelte, no DOM, no engine calls): diff the buffer against the baseline, pick
// patch / merged insert-delete / full recompile, and assemble the exact TeX to send.
// The same code drives the app and the headless edit-class matrix (tests/live).

export type Para = { text: string; startLine: number; wrap?: string; idx?: number; env?: string; head?: string };

// Split a .tex buffer into prose paragraphs (line-numbered), treating blank lines,
// comment-only lines, and block-level command lines (\begin, \item, \chapter, ...) as
// boundaries -- so the header line above a body paragraph isn't glued onto it.
const BLOCK_CMD =
	/^\s*\\(section|subsection|subsubsection|paragraph|subparagraph|chapter|begin|end|item|maketitle|caption|label|title|author|date|bibliography|printbibliography|tableofcontents|input|include)\b/;
const isBoundary = (ln: string) => ln.trim() === '' || /^\s*%/.test(ln) || BLOCK_CMD.test(ln);
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
	const out: Para[] = [];
	const lines = src.split('\n');
	let cur: string[] = [];
	let start = 0;
	let wrap = '';
	let idx = 0;
	let curHead = '';
	const listStack: { env: string; n: number }[] = [];
	const flush = () => {
		if (cur.length) out.push({ text: cur.join('\n'), startLine: start + 1, wrap: wrap || undefined, idx, head: curHead || undefined });
		cur = [];
		curHead = '';
	};
	for (let i = 0; i < lines.length; i++) {
		const ln = lines[i];
		const be = ln.match(BEGIN_ENV);
		if (be && !NON_BLOCK_ENVS.has(be[1]) && !listStack.length) {
			flush();
			// nesting-aware: accumulate until the matching \end (blank lines included)
			const s0 = i;
			let depth = 0;
			const blk: string[] = [];
			for (; i < lines.length; i++) {
				depth += (lines[i].match(/\\begin\{[a-zA-Z*]+\}/g) || []).length;
				depth -= (lines[i].match(/\\end\{[a-zA-Z*]+\}/g) || []).length;
				blk.push(lines[i]);
				if (depth <= 0) break;
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
			if (im[1].trim()) {
				start = i;
				cur = [im[1]];
				wrap = top ? top.env : '';
				idx = top ? top.n : 0;
			}
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
		if (isBoundary(ln)) {
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
// The counter is pinned to a FIXED value so repeated typesets are deterministic -- the
// engine's own counter would accumulate across requests. The pinned (likely wrong) label
// digit fails exact verification and demotes to provisional; the reconcile paints the
// real number. (A JS re-count of \item lines used to guess the true value: deleted --
// reconstructing TeX counter state in JS is exactly the approximation we don't do.)
export const wrapItem = (t: string, w?: string) => {
	if (!w) return t;
	const setc = w === 'enumerate' ? '\\setcounter{enumi}{0}' : '';
	return `\\begin{${w}}${setc}\\item ${t}\\end{${w}}`;
};
// comment stripping is ONLY for JS-side lexing guards (brace balance); dispatched text
// ships verbatim -- the engine's own catcodes decide what a % means
export const stripTexComments = (s: string) => s.replace(/([^\\]|^)%.*$/gm, '$1');
// Heading dispatch prefix: the daemon's section counters accumulate across requests
// (\section{hi} renders "1 hi", then "2 hi", ...) and \@startsection's beforeskip
// depends on the leftover @nobreak state -- both nondeterministic. Pin the counters and
// force @nobreak so every typeset of the same heading is identical; the (likely wrong)
// number renders as a PROVISIONAL patch and the reconcile pass paints the real one.
const HEAD_RESET: Record<string, string> = {
	section: '\\setcounter{section}{0}',
	subsection: '\\setcounter{section}{1}\\setcounter{subsection}{0}',
	subsubsection: '\\setcounter{section}{1}\\setcounter{subsection}{1}\\setcounter{subsubsection}{0}',
	// run-in levels print no number at default secnumdepth; pinned anyway for docs that raise it
	paragraph: '\\setcounter{section}{1}\\setcounter{subsection}{1}\\setcounter{subsubsection}{1}\\setcounter{paragraph}{0}',
	subparagraph:
		'\\setcounter{section}{1}\\setcounter{subsection}{1}\\setcounter{subsubsection}{1}\\setcounter{paragraph}{1}\\setcounter{subparagraph}{0}'
};
export const wrapHead = (t: string, head?: string) => (head ? `\\makeatletter\\@nobreaktrue\\makeatother${HEAD_RESET[head] ?? ''}${t}` : t);
// a Para as the daemon should typeset it (list items re-wrapped, headings pinned)
export const paraTex = (p: Para) => wrapHead(wrapItem(p.text, p.wrap), p.head);

// While typing you pass through unbalanced states (\textbf{ before the }, $ before its
// close). An unclosed brace group has no paragraph terminator, so the daemon's typeset
// never finishes -- it blocks the full 6s timeout, then SIGKILLs and cold-respawns the
// engine. So only fire the instant patch once groups and inline math are balanced.
// (Lexes over comment-stripped text; braces inside comments aren't grouping.)
export const daemonReady = (raw: string): boolean => {
	const t = stripTexComments(raw);
	let depth = 0;
	let dollars = 0;
	for (let i = 0; i < t.length; i++) {
		const c = t[i];
		if (c === '\\')
			i++; // skip the escaped char: \{ \} \$ \\ aren't grouping
		else if (c === '{') depth++;
		else if (c === '}') {
			if (--depth < 0) return false;
		} else if (c === '$') dollars++;
	}
	return depth === 0 && dollars % 2 === 0;
};
// Mid-typing repair: close still-open math/braces IN NESTING ORDER so the daemon can render
// the partial result instantly ($x + y -> $x + y$; \textbf{par -> \textbf{par}). The closers
// exist only in this transient render, never in the buffer. Null = not repairable (stray
// closers) -> hold the last preview.
export function repairForPreview(raw: string): string | null {
	const stack: string[] = [];
	const t = stripTexComments(raw);
	for (let i = 0; i < t.length; i++) {
		const c = t[i];
		if (c === '\\') {
			const n = t[i + 1];
			if (n === '(') stack.push('\\)');
			else if (n === '[') stack.push('\\]');
			else if (n === ')') {
				if (stack.pop() !== '\\)') return null;
			} else if (n === ']') {
				if (stack.pop() !== '\\]') return null;
			}
			i++;
		} else if (c === '{') stack.push('}');
		else if (c === '}') {
			if (stack.pop() !== '}') return null;
		} else if (c === '$') {
			if (stack[stack.length - 1] === '$') stack.pop();
			else stack.push('$');
		}
	}
	// closers land on their own LINE: appended to the raw text they could fall inside a
	// trailing % comment and vanish
	return stack.length ? raw + '\n' + stack.reverse().join('') : raw;
}

// a buffer minus one paragraph's lines: byte-equal cuts on both sides prove the edit is
// confined to that paragraph. No lexical normalization -- deciding that a comment or a
// blank line is render-inert is the ENGINE's call, so anything else recompiles.
const cut = (s: string, p: Para) => {
	const L = s.split('\n');
	L.splice(p.startLine - 1, p.text.split('\n').length);
	return L.join('\n');
};

export type ParaRef = { line: number; endLine: number; text: string; listItem: boolean };
export type PatchAction = {
	line: number;
	endLine: number;
	text: string;
	orig: string;
	transient: boolean;
	floatInner: boolean;
	listItem: boolean;
	// the edit added/removed a TeX command (vs pure prose/argument typing). Commands can
	// carry semantics no glyph-geometry predicate sees (\noindent, \color, \setlength,
	// user macros), so such a patch renders instantly but must reconcile to certify --
	// silent drift is worse than a recompile. Our own \par joiner is exempt.
	cmdChanged: boolean;
};
export type EditDecision =
	| { kind: 'noop' }
	// a boundary line (\label, \title, \chapter, \caption, \input, ...) changed
	| { kind: 'boundary' }
	// mid-command state that can't be repaired: hold the preview, wait for the next keystroke
	| { kind: 'skip-unbalanced'; line: number }
	// the paragraph is a non-list env BODY: not a standalone typeset unit
	| { kind: 'env-body'; env: string; line: number }
	// heavier change -> debounced full recompile; focus registers the first diverging
	// block. Inserted/deleted paragraphs that CAN render instantly ride the merged-patch
	// path (prev + \par + run typeset as ONE engine unit, so indent and spacing are the
	// engine's); everything else takes the honest full pass -- there is no JS-placed
	// splice fallback.
	| {
			kind: 'structural';
			reason: 'para-count' | 'multi-para' | 'para+boundary';
			focus: ParaRef | null;
	  }
	// exactly one block changed: dispatch to the instant path
	| ({ kind: 'patch' } & PatchAction);

const refOf = (p: Para): ParaRef => ({
	line: p.startLine,
	endLine: p.startLine + p.text.split('\n').length - 1,
	text: paraTex(p),
	listItem: !!p.wrap || !!p.env || !!p.head
});

/** ONE decision point per edit: diff the buffer against the last-compiled baseline. */
export function decideEdit(baseline: string, src: string): EditDecision {
	const oldP = splitParas(baseline);
	const newP = splitParas(src);
	let single = -1;
	if (oldP.length === newP.length) {
		const changed: number[] = [];
		for (let i = 0; i < newP.length; i++) if (newP[i].text !== oldP[i].text) changed.push(i);
		// every paragraph identical: only a byte-identical buffer is a no-op. Whether a
		// comment or blank-line change renders the same is the ENGINE's call -> recompile.
		if (changed.length === 0) return src !== baseline ? { kind: 'boundary' } : { kind: 'noop' };
		// exactly one paragraph changed AND the rest of the buffer is byte-untouched ->
		// instant path. A boundary line changing alongside (a \label edited after an
		// unreconciled patch left the baseline behind) must recompile.
		if (changed.length === 1) {
			if (cut(src, newP[changed[0]]) === cut(baseline, oldP[changed[0]])) single = changed[0];
			else return structuralOf(baseline, oldP, newP, 'para+boundary');
		}
	}
	if (single < 0) return structuralOf(baseline, oldP, newP, oldP.length !== newP.length ? 'para-count' : 'multi-para');
	return buildPatch(baseline, oldP[single], newP[single]);
}

// The single-block instant dispatch for a (baseline, edited) paragraph pair. Also used by
// the compound structural path: an exact patch never advances the baseline, so the routine
// "type in a paragraph, then open a new one" reads as modified+inserted -- the modified
// pair goes through here while the insert splices provisionally.
function buildPatch(baseline: string, oP: Para, nP: Para): EditDecision {
	// text ships VERBATIM (comments, line structure): the engine's catcodes decide what
	// they mean. Mid-command (unbalanced braces / open math): raw dispatch would hang the
	// daemon. REPAIR the transient text (auto-close open math/groups) so partial math
	// renders live while typing; the repaired edit is transient (may patch or hold, never
	// compile).
	let sendText = nP.text;
	let transient = false;
	if (!daemonReady(sendText)) {
		const rep = repairForPreview(sendText);
		if (rep === null || !daemonReady(rep)) return { kind: 'skip-unbalanced', line: oP.startLine };
		sendText = rep;
		transient = true;
	}
	// A paragraph that is the BODY of a non-list environment (equation, tabular, align...) is
	// not a standalone typeset unit: the daemon error-recovers it into something with the same
	// glyphs but the wrong layout. Lists are fine (wrapItem re-wraps them).
	{
		const baseLines = baseline.split('\n');
		let pl = oP.startLine - 2; // line above the paragraph, 0-based
		while (pl >= 0 && baseLines[pl].trim() === '') pl--;
		// document/frame are exempt: text after \begin{document} or inside a beamer frame is
		// ordinary prose, not an env body
		const env = pl >= 0 ? baseLines[pl].match(/^\s*\\begin\{([a-zA-Z*]+)\}/) : null;
		if (env && !['itemize', 'enumerate', 'description', 'document', 'frame'].includes(env[1]))
			return { kind: 'env-body', env: env[1], line: oP.startLine };
	}
	// A cell edit inside a FLOATED table can't typeset the whole float (the daemon discards
	// float material), but the inner tabular alone typesets fine: dispatch just the tabular
	// when the change is confined to it. Caption/placement edits keep the whole-block
	// dispatch, which cal-empties into the full pass.
	let dispatchText = wrapHead(wrapItem(sendText, nP.wrap), nP.head);
	let dispatchOrig = paraTex(oP);
	let floatInner = false;
	if (nP.env && /^(table|figure)\*?$/.test(nP.env)) {
		const TAB = /\\begin\{(tabular\*?|tabularx|array)\}[\s\S]*?\\end\{\1\}/;
		const oSub = dispatchOrig.match(TAB)?.[0] ?? null;
		const nSub = dispatchText.match(TAB)?.[0] ?? null;
		if (oSub && nSub && dispatchOrig.replace(oSub, ' ') === dispatchText.replace(nSub, ' ')) {
			// the float body's alignment declaration governs the tabular's x position: ship it
			// too, so the daemon's records carry the true (re)centered offsets instead of a
			// flush-left box the splice would anchor at the column margin
			const before = dispatchOrig.slice(0, dispatchOrig.indexOf(oSub));
			const align = before.match(/\\(?:centering|raggedleft|raggedright)(?![a-zA-Z])/g)?.pop() ?? '';
			dispatchText = align + nSub;
			dispatchOrig = align + oSub;
			floatInner = true;
		}
		// a \caption edit: typeset JUST the caption (float material cal-empties). \@captype is
		// what \caption reads to know its float type; the counter pin makes the daemon's number
		// deterministic ("Figure 1") -- the real number rides the fuzzy tier into a provisional
		// patch and the reconcile paints it, same as section numbers.
		if (!floatInner) {
			const CAP = /\\caption\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/;
			const oCap = dispatchOrig.match(CAP)?.[0] ?? null;
			const nCap = dispatchText.match(CAP)?.[0] ?? null;
			if (oCap && nCap && dispatchOrig.replace(oCap, ' ') === dispatchText.replace(nCap, ' ')) {
				const type = nP.env.replace('*', '');
				const pin = `\\makeatletter\\def\\@captype{${type}}\\makeatother\\setcounter{${type}}{0}`;
				dispatchText = pin + nCap;
				dispatchOrig = pin + oCap;
				floatInner = true;
			}
		}
	}
	// footnote counter pin: FIXED value like the heading pins -- the engine's own counter
	// accumulates across requests, so a pin is needed purely for determinism. The (likely
	// wrong) mark digit fails exact verification and the patch rides the provisional tier;
	// the reconcile paints the true number. (A JS re-count of earlier \footnote marks used
	// to guess the real value: deleted -- that's TeX counter state reconstructed in JS.)
	const FN = /\\footnote(?:mark)?\s*[[{]/;
	if (FN.test(dispatchText) || FN.test(dispatchOrig)) {
		dispatchText = '\\setcounter{footnote}{0}' + dispatchText;
		dispatchOrig = '\\setcounter{footnote}{0}' + dispatchOrig;
	}
	const cmdsOf = (s: string) =>
		(s.match(/\\[a-zA-Z@]+/g) || [])
			.filter((c) => c !== '\\par')
			.sort()
			.join(' ');
	return {
		kind: 'patch',
		line: oP.startLine,
		endLine: oP.startLine + oP.text.split('\n').length - 1,
		text: dispatchText,
		orig: dispatchOrig,
		transient,
		floatInner,
		// env blocks and headings ride the listItem pathway: paraLeft = column left (their
		// records carry their own centering/indent) and no \parindent calibration variant
		listItem: !!nP.wrap || !!nP.env || !!nP.head,
		cmdChanged: cmdsOf(sendText) !== cmdsOf(stripTexComments(oP.text))
	};
}

function structuralOf(baseline: string, oldP: Para[], newP: Para[], reason: 'para-count' | 'multi-para' | 'para+boundary'): EditDecision {
	let fi = 0;
	const minLen = Math.min(oldP.length, newP.length);
	while (fi < minLen && oldP[fi].text === newP[fi].text) fi++;
	let bi = 0;
	while (bi < minLen - fi && oldP[oldP.length - 1 - bi].text === newP[newP.length - 1 - bi].text) bi++;
	const t = newP[Math.min(fi, newP.length - 1)];
	const out: EditDecision = { kind: 'structural', reason, focus: t ? refOf(t) : null };
	// shared-prefix + shared-suffix length: which unmatched paragraph is the EDIT of which
	const sim = (a: Para, b: Para) => {
		const x = a.text;
		const y = b.text;
		const n = Math.min(x.length, y.length);
		let p = 0;
		while (p < n && x[p] === y[p]) p++;
		let s = 0;
		while (s < n - p && x[x.length - 1 - s] === y[y.length - 1 - s]) s++;
		return p + s;
	};
	const plainProse = (p: Para) => !p.head && !p.wrap && !p.env;
	// a block the merged-patch path can carry: plain prose, a display heading, or a whole
	// non-float environment (the daemon typesets complete envs; floats it discards, and a
	// list item re-wrapped with an appended \par would render INSIDE the list). Nothing
	// here decides layout -- it only gates WHAT rides one engine typeset.
	const mergeable = (p: Para) => plainProse(p) || !!p.head || (!!p.env && !/^(table|figure)\*?$/.test(p.env) && !p.wrap);
	const insertable = (p: Para) => !p.env && !p.wrap && daemonReady(p.text);
	// Alignment scan: try every insert (or delete) position j inside the unmatched window and
	// accept it when the rest of the window agrees except AT MOST ONE modified pair -- the
	// pending-patch paragraph that never advanced the baseline (the normal state
	// mid-writing). Among valid alignments prefer no-modification, then the pairing whose
	// modified texts are most similar (a transposed pairing would splice swapped content).
	// `short` = the side without the extra paragraphs, `long` = with them; j indexes the
	// start of the inserted/deleted RUN of length k in LONG, mod the modified one in SHORT.
	type Align = { j: number; mod: number | null; score: number };
	const scan = (ins: boolean, k: number): Align | null => {
		const short = ins ? oldP : newP;
		const long = ins ? newP : oldP;
		let best: Align | null = null;
		for (let j = fi; j <= long.length - k - bi; j++) {
			let mod: number | null = null;
			let ok = true;
			for (let i = fi; i <= short.length - 1 - bi && ok; i++) {
				const li = i < j ? i : i + k;
				if (short[i].text !== long[li].text) {
					if (mod !== null) ok = false;
					else mod = i;
				}
			}
			if (!ok) continue;
			const score = mod === null ? Infinity : sim(short[mod], long[mod < j ? mod : mod + k]);
			if (!best || score > best.score) best = { j, mod, score };
		}
		return best;
	};
	const k = newP.length - oldP.length;
	if (k >= 1 && k <= 6 && fi > 0) {
		// typing routinely runs SEVERAL paragraphs ahead of the last landed reconcile (each
		// reconcile takes seconds); a contiguous run of k new paragraphs -- optionally right
		// after a pending-edit paragraph -- is still ONE region. It renders ONLY by riding
		// the previous block as one engine typeset (prev + \par + run): TeX then supplies
		// the indent and the inter-paragraph spacing. No JS-placed splice fallback exists;
		// anything the merged unit can't carry takes the honest full pass.
		const a = scan(true, k);
		if (a) {
			const run = newP.slice(a.j, a.j + k);
			const runProse = run.every(plainProse) && run.every(insertable);
			const joined = run.map((p) => p.text).join('\n\\par ');
			if (a.mod === null) {
				const prev = oldP[a.j - 1];
				if (prev && runProse && mergeable(prev)) {
					const merged: Para = { ...prev, text: `${prev.text}\n\\par ${joined}` };
					const one = buildPatch(baseline, prev, merged);
					if (one.kind === 'patch') return one;
				}
			} else if (a.mod === a.j - 1) {
				// pending edit directly followed by the new run: one merged patch over the
				// modified paragraph's band (two separate splices alternated visually)
				const modOld = oldP[a.mod];
				const modNew = newP[a.mod];
				if (plainProse(modOld) && plainProse(modNew) && runProse) {
					const merged: Para = { ...modNew, text: `${modNew.text}\n\\par ${joined}` };
					const one = buildPatch(baseline, modOld, merged);
					if (one.kind === 'patch') return one;
				}
			}
		}
	} else if (k <= -1 && k >= -6 && fi > 0) {
		// deletions ride the same merged unit in reverse: orig = prev + \par + the removed
		// run (all still on the page, so the band locates), text = prev alone -- the engine
		// computes the closed-up height. Delete + pending edit stays a full pass.
		const kd = -k;
		const a = scan(false, kd);
		if (a && a.mod === null && a.j > 0) {
			const gone = oldP.slice(a.j, a.j + kd);
			const prev = oldP[a.j - 1];
			if (prev && mergeable(prev) && gone.every((p) => mergeable(p) || (plainProse(p) && daemonReady(p.text)))) {
				const mergedOrig: Para = { ...prev, text: `${prev.text}\n\\par ${gone.map((p) => p.text).join('\n\\par ')}` };
				const one = buildPatch(baseline, mergedOrig, prev);
				if (one.kind === 'patch') return one;
			}
		}
	}
	return out;
}
