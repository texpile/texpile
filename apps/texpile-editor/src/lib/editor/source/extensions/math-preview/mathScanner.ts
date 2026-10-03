// single-pass scanner for math regions ($…$, $$…$$, \(…\), \[…\], amsmath envs) in raw latex,
// used by the source-mode math preview. open regions clamp at the first blank line, so a lone $
// mid-edit can never swallow the rest of the file.

export type MathRegionKind = 'inline' | 'display';

export type MathRegion = {
	/** Full range including the delimiters (or `\begin…\end`). */
	from: number;
	to: number;
	/** The content between the delimiters. */
	innerFrom: number;
	innerTo: number;
	kind: MathRegionKind;
	/** set when the region is a math environment (align, equation*, …). */
	env?: string;
	/** no closing delimiter yet (mid-edit), clamped at a blank line or EOF. */
	unclosed?: boolean;
};

/** `math` is the inline one. */
const MATH_ENVS = new Set([
	'math',
	'displaymath',
	'equation',
	'equation*',
	'align',
	'align*',
	'alignat',
	'alignat*',
	'gather',
	'gather*',
	'multline',
	'multline*',
	'flalign',
	'flalign*',
	'eqnarray',
	'eqnarray*',
	'dmath',
	'dmath*'
]);

/** literal-text envs, no math delimiters apply inside. */
const SKIP_ENVS = new Set(['verbatim', 'verbatim*', 'lstlisting', 'minted', 'comment', 'filecontents', 'filecontents*']);

type OpenRegion = {
	from: number;
	innerFrom: number;
	kind: MathRegionKind;
	/** closing delimiter ('$', '$$', '\\)', '\\]'); '' for environments. */
	close: string;
	env?: string;
	/** same-name env nesting depth, so an inner \begin{x} doesn't close the outer. */
	depth: number;
};

function isLetter(code: number): boolean {
	return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/** `comments`: a % starts a comment, as in LaTeX; Markdown reads it as text */
export function findMathRegions(text: string, comments = true): MathRegion[] {
	const regions: MathRegion[] = [];
	const n = text.length;
	let i = 0;
	let open: OpenRegion | null = null;

	function close(innerTo: number, to: number, unclosed = false) {
		if (!open) return;
		const region: MathRegion = { from: open.from, to, innerFrom: open.innerFrom, innerTo, kind: open.kind };
		if (open.env) region.env = open.env;
		if (unclosed) region.unclosed = true;
		regions.push(region);
		open = null;
	}

	while (i < n) {
		const ch = text.charCodeAt(i);

		// comment: skip to end of line. escaped \% never gets here, the backslash handler eats pairs.
		if (comments && ch === 37 /* % */) {
			while (i < n && text.charCodeAt(i) !== 10) i++;
			continue;
		}

		// math can't contain a paragraph break, so clamp any open region at a blank line
		if (ch === 10 /* \n */) {
			if (open) {
				let j = i + 1;
				let c = j < n ? text.charCodeAt(j) : -1;
				while (c === 32 || c === 9 || c === 13) {
					j++;
					c = j < n ? text.charCodeAt(j) : -1;
				}
				if (j >= n || c === 10) close(i, i, true);
			}
			i++;
			continue;
		}

		if (ch === 92 /* \ */) {
			const next = i + 1 < n ? text[i + 1] : '';
			if (next === '(') {
				if (!open) open = { from: i, innerFrom: i + 2, kind: 'inline', close: '\\)', depth: 0 };
				i += 2;
				continue;
			}
			if (next === ')') {
				if (open && open.close === '\\)') close(i, i + 2);
				i += 2;
				continue;
			}
			if (next === '[') {
				if (!open) open = { from: i, innerFrom: i + 2, kind: 'display', close: '\\]', depth: 0 };
				i += 2;
				continue;
			}
			if (next === ']') {
				if (open && open.close === '\\]') close(i, i + 2);
				i += 2;
				continue;
			}
			if (next && isLetter(next.charCodeAt(0))) {
				let j = i + 1;
				while (j < n && isLetter(text.charCodeAt(j))) j++;
				const name = text.slice(i + 1, j);
				if (name === 'begin' || name === 'end') {
					let k = j;
					while (k < n && (text[k] === ' ' || text[k] === '\t')) k++;
					if (k < n && text[k] === '{') {
						const brace = text.indexOf('}', k + 1);
						if (brace > 0) {
							const env = text.slice(k + 1, brace);
							const after = brace + 1;
							if (name === 'begin') {
								if (!open && SKIP_ENVS.has(env)) {
									const endTok = `\\end{${env}}`;
									const idx = text.indexOf(endTok, after);
									i = idx < 0 ? n : idx + endTok.length;
									continue;
								}
								if (open && open.env === env) open.depth++;
								else if (!open && MATH_ENVS.has(env)) {
									open = {
										from: i,
										innerFrom: after,
										kind: env === 'math' ? 'inline' : 'display',
										close: '',
										env,
										depth: 0
									};
								}
							} else if (open && open.env === env) {
								if (open.depth > 0) open.depth--;
								else close(i, after);
							}
							i = after;
							continue;
						}
					}
					i = j;
					continue;
				}
				if (name === 'verb') {
					// \verb|…| / \verb*|…|: the next char is the delimiter, verbatim until it repeats
					let k = j;
					if (k < n && text[k] === '*') k++;
					if (k < n) {
						const end = text.indexOf(text[k], k + 1);
						i = end < 0 ? n : end + 1;
					} else {
						i = k;
					}
					continue;
				}
				i = j;
				continue;
			}
			// escaped symbol: consume the pair so it can't be misread as a delimiter
			// (also what keeps \\[2pt] from opening \[ math)
			i += 2;
			continue;
		}

		if (ch === 36 /* $ */) {
			if (open) {
				if (open.close === '$$') {
					if (i + 1 < n && text[i + 1] === '$') {
						close(i, i + 2);
						i += 2;
						continue;
					}
				} else if (open.close === '$') {
					close(i, i + 1);
					i++;
					continue;
				}
				// $ inside \(…\) / \[…\] / an environment, not our closer
				i++;
				continue;
			}
			if (i + 1 < n && text[i + 1] === '$') {
				open = { from: i, innerFrom: i + 2, kind: 'display', close: '$$', depth: 0 };
				i += 2;
				continue;
			}
			open = { from: i, innerFrom: i + 1, kind: 'inline', close: '$', depth: 0 };
			i++;
			continue;
		}

		i++;
	}

	close(n, n, true);
	return regions;
}

/** region containing pos. right after the closing delimiter still counts, right before the opener does not. */
export function mathRegionAt(regions: MathRegion[], pos: number): MathRegion | null {
	let lo = 0;
	let hi = regions.length - 1;
	let found: MathRegion | null = null;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (regions[mid].from < pos) {
			found = regions[mid];
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return found && pos <= found.to ? found : null;
}
