// @vitest-environment node
// Typst math -> LaTeX is tex2typst's job now, and tex2typst is not exact: `norm(v)` comes back as
// `v` with its bars gone. Nothing here trusts it. The round trip decides what may be edited, and
// MathLive's own validateLatex (SSR build, node only) decides whether the LaTeX is even parseable
// by the editor that has to render it.
import { describe, it, expect } from 'vitest';
import { validateLatex } from 'mathlive';
import { typstMathToLatex } from '$lib/languages/typst/visual/convert/mathTranslate';

/** what people actually write in Typst papers */
const CORPUS = [
	'a + b',
	'a - b',
	'a b',
	'a = b',
	'x^2 + y^2 = z^2',
	'(a + b)^2',
	'a != b',
	'a <= b <= c',
	'x_i',
	'x^n',
	'x_i^2',
	'a_(i j)',
	'x_(n+1)',
	'e^(-x^2)',
	'a/b',
	'(a+b)/2',
	'frac(a, b)',
	'1/(1+x)',
	'sqrt(2)',
	'sqrt(x^2 + y^2)',
	'root(3, x)',
	'sum_(i=1)^n a_i',
	'product_(i=1)^n a_i',
	'integral_0^1 f dif x',
	'lim_(x -> 0) f(x)',
	'alpha + beta',
	'Gamma(n)',
	'theta.alt',
	'epsilon > 0',
	'lambda_i',
	'a in A',
	'A subset B',
	'A union B',
	'A sect B',
	'a approx b',
	'a prop b',
	'RR^n',
	'NN',
	'ZZ',
	'forall x',
	'exists y',
	'x in RR',
	'sin x',
	'cos theta',
	'log n',
	'ln x',
	'exp(x)',
	'max(a, b)',
	'hat(x)',
	'tilde(a)',
	'arrow(v)',
	'overline(x)',
	'mat(1, 0; 0, 1)',
	'mat(a, b; c, d)',
	'cases(x "if" y, z "else")',
	'binom(n, k)',
	'floor(x)',
	'ceil(x)',
	'a -> b',
	'a => b',
	'a |-> b',
	'cal(A)',
	'bold(v)',
	'partial f',
	'nabla g',
	'infinity',
	'a times b'
];

describe('typstMathToLatex', () => {
	// the whole safety argument: anything it hands back must be renderable by MathLive
	it('every accepted equation produces LaTeX MathLive can parse', () => {
		const broken: string[] = [];
		for (const typ of CORPUS) {
			const latex = typstMathToLatex(typ);
			if (latex == null) continue;
			const errors = validateLatex(latex);
			if (errors.length) broken.push(`${typ}  ->  ${latex}  [${errors.map((e) => e.code).join(',')}]`);
		}
		expect(broken).toEqual([]);
	});

	it('covers the ordinary shapes a paper uses', () => {
		// a floor under the corpus, not a target: this used to be 57% with no function calls at all
		const accepted = CORPUS.filter((t) => typstMathToLatex(t) != null).length;
		expect(accepted / CORPUS.length).toBeGreaterThan(0.85);
	});

	it('translates the function calls the old hand-written table had no case for', () => {
		expect(typstMathToLatex('sqrt(2)')).toBe('\\sqrt{2}');
		expect(typstMathToLatex('mat(1, 0; 0, 1)')).toContain('pmatrix');
		expect(typstMathToLatex('binom(n, k)')).toContain('binom');
	});

	// tex2typst drops the bars entirely; the round trip is what notices
	it('refuses a conversion that loses content', () => {
		expect(typstMathToLatex('norm(v)')).toBeNull();
	});

	it('refuses LaTeX MathLive cannot parse, even when it round-trips', () => {
		expect(typstMathToLatex('abs(x)')).toBeNull();
	});

	it('keeps a space that separates two identifiers', () => {
		// `a b` is two symbols and `ab` is one, so the guard may not treat them as equal
		expect(typstMathToLatex('a b')).not.toBeNull();
		expect(typstMathToLatex('a b')).not.toBe(typstMathToLatex('ab'));
	});
});

// A typst function tex2typst has no mapping for comes out as a bare `\name`, and MathLive cannot
// parse those. The guard carries a list of them, and a list collected by hand goes stale, so sweep
// typst's math module and let validateLatex say which ones the guard still has to catch.
describe('the unparseable-command list stays complete', () => {
	const MATH_FUNCTIONS = `
		frac dfrac tfrac binom sqrt root vec hat widehat tilde widetilde overline ol underline ul
		bar macron dot ddot grave acute check breve arrow harpoon abs norm floor ceil round lr mat
		cases sum product integral lim max min sup inf det gcd exp log ln sin cos tan cal bb bold
		upright italic sans frak mono serif display inline script sscript op text underbrace
		overbrace underbracket overbracket cancel accent attach limits scripts primes
	`
		.trim()
		.split(/\s+/);

	it('rejects every function whose LaTeX MathLive would choke on', () => {
		const leaked: string[] = [];
		for (const fn of MATH_FUNCTIONS) {
			const latex = typstMathToLatex(`${fn}(x)`);
			if (latex == null) continue; // already refused, for this or any other reason
			if (validateLatex(latex).length) leaked.push(`${fn} -> ${latex}`);
		}
		expect(leaked).toEqual([]);
	});
});
