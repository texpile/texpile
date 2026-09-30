// Typst math -> LaTeX, so MathLive (which speaks LaTeX only) can edit the equation.
//
// The translation is accepted ONLY when converting it straight back reproduces the equation we
// started from. tex2typst owns both directions and is not exact - `norm(v)` comes back as `v`, its
// bars gone - so the round trip, not the library, is what decides. Whatever fails it stays a raw
// island, byte-exact, as an unprovable equation always has.
import { typst2tex } from 'tex2typst';
import { latexToTypst } from '../serialize/latexToTypst';

/**
 * Spellings tex2typst prefers that typst renders identically to what the user wrote. Folded before
 * the comparison so a re-spelled round trip still counts as equal: the bar is to look the same,
 * not to be byte-equal. `lr(` is pure grouping; `dif` is `upright(d)`.
 */
const SAME_LOOK: [RegExp, string][] = [
	[/\bbb\(([A-Z])\)/g, '$1$1'],
	[/\bmacron\(/g, 'bar('],
	[/\bdot\.op\b/g, 'dot'],
	[/\btilde\.op\b/g, '~'],
	[/\bdif\b/g, 'upright(d)'],
	[/\bvec\(/g, 'mat('],
	[/\blr\(/g, '(']
];

/**
 * The equation as a token list: names, numbers and operator characters, in order. Whitespace,
 * parentheses and the comma/semicolon separators drop out, since tex2typst re-groups freely
 * (`sigma^2 / n` comes back `(sigma^2)/n`, `vec(1, 2)` as `mat(1; 2)`) while a symbol it lost
 * (`norm`) still shows as a missing token. `a b` stays two tokens and `ab` one: fusing them would
 * be a different equation.
 */
function shape(s: string): string {
	let t = s;
	for (const [re, to] of SAME_LOOK) t = t.replace(re, to);
	return (t.match(/[A-Za-z][\w.]*|\d+(?:\.\d+)?|[^\s(),;]/g) ?? []).join(' ');
}

/**
 * A typst math function tex2typst has no mapping for comes out as a bare `\name`, which MathLive
 * then cannot parse - the equation would render as an error rather than a formula. The round trip
 * cannot see this: tex2typst reads its own output back happily and MathLive is not party to it.
 *
 * Swept from typst's math module rather than collected by hand; mathTranslate.test.ts re-runs that
 * sweep against mathlive's validateLatex (its SSR build, node only) so the list cannot go stale.
 */
const MATHLIVE_CANNOT_PARSE = /\\(?:abs|accent|attach|harpoon|ol|overbracket|primes|round|script|scripts|serif|sscript|ul|underbracket)\b/;

/** the LaTeX for an equation's inner source, or null when it does not survive the round trip */
export function typstMathToLatex(inner: string): string | null {
	if (!inner.trim()) return null;
	let latex: string;
	try {
		latex = typst2tex(inner);
	} catch {
		return null; // typst2tex throws on what it cannot read
	}
	if (typeof latex !== 'string' || !latex.trim()) return null;
	if (MATHLIVE_CANNOT_PARSE.test(latex)) return null;
	const back = latexToTypst(latex);
	if (back == null || shape(back) !== shape(inner)) return null;
	return latex.trim();
}
