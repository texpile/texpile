// LaTeX masking for harper: blank out markup so only prose reaches the linter, keeping every
// offset identical to the source (masked chars become spaces). Ported from upstream harper-tex's
// Masker (scratch/harper/harper-tex/src/masker.rs), with tighter comment/math/verbatim handling.

const MATH_ENVS = new Set([
	'equation',
	'equation*',
	'align',
	'align*',
	'gather',
	'gather*',
	'multline',
	'multline*',
	'flalign',
	'flalign*',
	'alignat',
	'alignat*',
	'eqnarray',
	'eqnarray*',
	'math',
	'displaymath'
]);

// bodies that are code/markup, never prose
const OPAQUE_ENVS = new Set(['verbatim', 'verbatim*', 'lstlisting', 'minted', 'tikzpicture', 'comment', 'filecontents', 'filecontents*']);

// commands whose braced argument IS prose: mask "\name[opt]{" and keep scanning inside
const CONTENT_COMMANDS = new Set([
	'section',
	'subsection',
	'subsubsection',
	'paragraph',
	'subparagraph',
	'part',
	'chapter',
	'title',
	'author',
	'caption',
	'textbf',
	'textit',
	'textsc',
	'emph',
	'underline',
	'footnote',
	'footnotetext',
	'thanks'
]);

const isLetter = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

export interface TexMask {
	/** source with every masked char replaced by a space; same length as the input */
	text: string;
	/** merged [from, to) masked ranges, sorted — lints overlapping any of these are synthetic */
	spans: [number, number][];
}

export function maskTex(src: string): TexMask {
	const n = src.length;
	const m = new Uint8Array(n);
	const mask = (from: number, to: number) => m.fill(1, Math.max(0, from), Math.min(n, to));

	// balanced {...} starting at an opening brace; -1 when unterminated
	const matchBrace = (open: number): number => {
		let depth = 0;
		for (let k = open; k < n; k++) {
			const c = src[k];
			if (c === '\\') k++;
			else if (c === '{') depth++;
			else if (c === '}' && --depth === 0) return k;
		}
		return -1;
	};

	// \name*[opt] anatomy at a backslash; curlyAt = position of a directly following '{'
	const readCommand = (at: number): { name: string; afterOpt: number; curlyAt: number } | null => {
		if (at + 1 >= n) return null;
		let k = at + 1;
		let name = src[k++];
		while (k < n && isLetter(src[k])) name += src[k++];
		if (src[k] === '*') {
			name += '*';
			k++;
		}
		let afterOpt = k;
		if (src[afterOpt] === '[') {
			const close = src.indexOf(']', afterOpt + 1);
			if (close >= 0) afterOpt = close + 1;
		}
		return { name, afterOpt, curlyAt: src[afterOpt] === '{' ? afterOpt : -1 };
	};

	let i = 0;
	while (i < n) {
		const c = src[i];
		if (c === '%') {
			// TeX comments hide the rest of the line AND consume the newline (lines join)
			const eol = src.indexOf('\n', i);
			const j = eol < 0 ? n : eol + 1;
			mask(i, j);
			i = j;
		} else if (c === '\n') {
			// indentation is layout, not prose; the newline itself stays visible so harper
			// keeps its sentence/paragraph boundaries
			let j = i + 1;
			while (j < n && (src[j] === ' ' || src[j] === '\t')) j++;
			if (j > i + 1) mask(i + 1, j);
			i = j;
		} else if (c === '$') {
			const dbl = src[i + 1] === '$';
			const close = src.indexOf(dbl ? '$$' : '$', i + (dbl ? 2 : 1));
			const j = close < 0 ? n : close + (dbl ? 2 : 1);
			mask(i, j);
			i = j;
		} else if (c === '\\') {
			const cmd = readCommand(i);
			if (!cmd) {
				mask(i, i + 1);
				i++;
				continue;
			}
			const { name, afterOpt, curlyAt } = cmd;
			if (name === '(' || name === '[') {
				// inline/display math shorthand: mask through the matching closer
				const closer = name === '(' ? '\\)' : '\\]';
				const close = src.indexOf(closer, i + 2);
				const j = close < 0 ? n : close + 2;
				mask(i, j);
				i = j;
			} else if ((name === 'verb' || name === 'verb*') && afterOpt < n) {
				const delim = src[afterOpt];
				const close = src.indexOf(delim, afterOpt + 1);
				const j = close < 0 ? n : close + 1;
				mask(i, j);
				i = j;
			} else if (name === 'begin' && curlyAt >= 0) {
				const envClose = src.indexOf('}', curlyAt + 1);
				const env = envClose < 0 ? '' : src.slice(curlyAt + 1, envClose);
				if (MATH_ENVS.has(env) || OPAQUE_ENVS.has(env)) {
					const end = src.indexOf(`\\end{${env}}`, envClose + 1);
					const j = end < 0 ? n : end + 6 + env.length;
					mask(i, j);
					i = j;
				} else {
					// mask \begin{env} plus its argument groups ({ll} col specs, [t] placements)
					let j = envClose < 0 ? n : envClose + 1;
					for (;;) {
						if (src[j] === '[') {
							const close = src.indexOf(']', j + 1);
							if (close < 0) break;
							j = close + 1;
						} else if (src[j] === '{') {
							const close = matchBrace(j);
							if (close < 0) break;
							j = close + 1;
						} else break;
					}
					mask(i, j);
					i = j;
				}
			} else if (curlyAt >= 0 && CONTENT_COMMANDS.has(name)) {
				// the argument is prose: mask up to and including '{', keep scanning inside
				// (the closing brace is masked as a bare brace when the scan reaches it)
				mask(i, curlyAt + 1);
				i = curlyAt + 1;
			} else if (curlyAt >= 0) {
				const close = matchBrace(curlyAt);
				if (close >= 0) {
					mask(i, close + 1);
					i = close + 1;
				} else {
					mask(i, curlyAt);
					i = curlyAt;
				}
			} else {
				mask(i, afterOpt);
				i = afterOpt;
			}
		} else if (c === '{' || c === '}' || c === '~' || c === '&' || c === '#' || c === '^' || c === '_') {
			mask(i, i + 1);
			i++;
		} else {
			i++;
		}
	}

	const out = new Array<string>(n);
	const spans: [number, number][] = [];
	for (let k = 0; k < n; k++) {
		if (m[k]) {
			out[k] = ' ';
			const last = spans[spans.length - 1];
			if (last && last[1] === k) last[1] = k + 1;
			else spans.push([k, k + 1]);
		} else out[k] = src[k];
	}
	return { text: out.join(''), spans };
}

/** true when [from, to) overlaps any masked span (binary search; spans are sorted). */
export function overlapsMask(spans: [number, number][], from: number, to: number): boolean {
	let lo = 0,
		hi = spans.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const [s, e] = spans[mid];
		if (e <= from) lo = mid + 1;
		else if (s >= to) hi = mid - 1;
		else return true;
	}
	return false;
}
