import { TYPST_SYMBOL_ROWS } from '$lib/languages/typst/symbols/typstSymbolTable';

// the math module's own names beside its symbols: what an equation already means by a bare word
const MATH_NAMES =
	'dif Dif thin med thick quad wide abs norm floor ceil round sqrt root frac binom vec mat cases lr mid bold upright italic sans serif frak mono bb cal scr op limits scripts attach stretch accent hat tilde macron dot dot.double arrow overline underline overbrace underbrace cancel class display inline script sscript primes arccos arcsin arctan arg cos cosh cot coth csc csch ctg deg det dim exp gcd lcm hom id im inf ker lg lim liminf limsup ln log max min mod Pr sec sech sin sinc sinh sup tan tanh tg tr';

export const TYPST_MATH_NAMES: ReadonlySet<string> = new Set([
	...MATH_NAMES.split(' '),
	...Object.values(TYPST_SYMBOL_ROWS).flatMap((rows) =>
		rows.flatMap(([name]) => {
			const path = name.replace(/^(sym|emoji)\./, '');
			return [path, path.split('.')[0]];
		})
	)
]);
