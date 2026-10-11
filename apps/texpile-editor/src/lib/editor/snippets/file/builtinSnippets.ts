// the built-in layer: LaTeX Workshop's "@" mnemonics, with a Typst body where Typst has the symbol.
// a user file turns one off with { "disabled": true } under its name
import type { Snippet, SnippetVariables } from './snippetTypes';

// [mnemonic, LaTeX body, Typst body or null]. bodies are VS Code snippet syntax: $0 is the last stop
const AT_MNEMONICS: readonly (readonly [string, string, string | null])[] = [
	['.', '\\cdot', 'dot.op'],
	['*', '\\times', 'times'],
	['/', '\\frac{$1}{$2}$0', '($1)/($2)$0'],
	['8', '\\infty', 'oo'],
	['0', '\\emptyset', 'emptyset'],
	['6', '\\partial', 'partial'],
	['\\', '\\setminus', 'without'],
	['-', '\\to', 'arrow.r'],
	['=', '\\equiv', 'equiv'],
	['~', '\\sim', 'tilde.op'],
	['<', '\\leq', 'lt.eq'],
	['>', '\\geq', 'gt.eq'],
	['a', '\\alpha', 'alpha'],
	['b', '\\beta', 'beta'],
	['g', '\\gamma', 'gamma'],
	['d', '\\delta', 'delta'],
	['e', '\\epsilon', 'epsilon.alt'],
	['l', '\\lambda', 'lambda'],
	['s', '\\sigma', 'sigma'],
	['p', '\\pi', 'pi'],
	['o', '\\omega', 'omega'],
	['sum', '\\sum_{${1:i=1}}^{${2:n}} $0', 'sum_(${1:i=1})^(${2:n}) $0'],
	['int', '\\int_{$1}^{$2} $3 \\, d${4:x}', 'integral_($1)^($2) $3 dif ${4:x}'],
	['lim', '\\lim_{${1:x \\to \\infty}} $0', 'lim_(${1:x -> oo}) $0'],
	['sq', '\\sqrt{$1}$0', 'sqrt($1)$0'],
	['^', '\\hat{$1}$0', 'hat($1)$0'],
	['v', '\\vec{$1}$0', 'arrow($1)$0'],
	['_', '\\bar{$1}$0', 'macron($1)$0'],
	['%', '\\frac{$1}{$2}$0', '($1)/($2)$0'],
	['@', '\\circ', 'compose'],
	[';', '\\dot{$1}$0', 'dot($1)$0'],
	[':', '\\ddot{$1}$0', 'dot.double($1)$0'],
	['2', '\\sqrt{$1}$0', 'sqrt($1)$0'],
	['I', '\\int_{$1}^{$2}$0', 'integral_($1)^($2)$0'],
	['|', '\\Big|', null],
	['+', '\\bigcup', 'union.big'],
	[',', '\\nonumber', null],
	['c', '\\chi', 'chi'],
	['ve', '\\varepsilon', 'epsilon'],
	['f', '\\phi', 'phi.alt'],
	['vf', '\\varphi', 'phi'],
	['h', '\\eta', 'eta'],
	['i', '\\iota', 'iota'],
	['k', '\\kappa', 'kappa'],
	['m', '\\mu', 'mu'],
	['n', '\\nu', 'nu'],
	['vp', '\\varpi', 'pi.alt'],
	['q', '\\theta', 'theta'],
	['vq', '\\vartheta', 'theta.alt'],
	['r', '\\rho', 'rho'],
	['vr', '\\varrho', 'rho.alt'],
	['vs', '\\varsigma', 'sigma.alt'],
	['t', '\\tau', 'tau'],
	['u', '\\upsilon', 'upsilon'],
	['&', '\\wedge', 'and'],
	['x', '\\xi', 'xi'],
	['y', '\\psi', 'psi'],
	['z', '\\zeta', 'zeta'],
	['D', '\\Delta', 'Delta'],
	['F', '\\Phi', 'Phi'],
	['G', '\\Gamma', 'Gamma'],
	['Q', '\\Theta', 'Theta'],
	['L', '\\Lambda', 'Lambda'],
	['P', '\\Pi', 'Pi'],
	['X', '\\Xi', 'Xi'],
	['Y', '\\Psi', 'Psi'],
	['S', '\\Sigma', 'Sigma'],
	['U', '\\Upsilon', 'Upsilon'],
	['W', '\\Omega', 'Omega'],
	['(', '\\left( $1 \\right)', 'lr(( $1 ))'],
	['{', '\\left\\{ $1 \\right\\\\\\}', 'lr({ $1 \\})'],
	['[', '\\left[ $1 \\right]', 'lr([ $1 ])']
];

export const BUILTIN_SNIPPETS: readonly Snippet[] = AT_MNEMONICS.map(([mnemonic, latex, typst]) => ({
	name: `@${mnemonic}`,
	layer: 'builtin',
	prefixes: [`@${mnemonic}`],
	bodies: typst === null ? { latex, markdown: latex } : { latex, markdown: latex, typst },
	description: '',
	context: 'math',
	auto: false,
	regex: false,
	flags: '',
	priority: 0
}));

const GREEK =
	'alpha|beta|gamma|Gamma|delta|Delta|epsilon|zeta|eta|theta|Theta|iota|kappa|lambda|Lambda|mu|nu|xi|Xi|pi|Pi|rho|sigma|Sigma|tau|upsilon|Upsilon|phi|Phi|chi|psi|Psi|omega|Omega';

export const BUILTIN_VARIABLES: SnippetVariables = {
	GREEK: { latex: GREEK, markdown: GREEK, typst: GREEK },
	SYMBOL: {
		latex:
			'parallel|perp|partial|nabla|hbar|ell|infty|oplus|ominus|otimes|oslash|square|star|dagger|vee|wedge|subseteq|subset|supseteq|supset|emptyset|exists|nexists|forall|implies|impliedby|iff|setminus|neg|lor|land|bigcup|bigcap|cdot|times|simeq|approx',
		markdown:
			'parallel|perp|partial|nabla|hbar|ell|infty|oplus|ominus|otimes|oslash|square|star|dagger|vee|wedge|subseteq|subset|supseteq|supset|emptyset|exists|nexists|forall|implies|impliedby|iff|setminus|neg|lor|land|bigcup|bigcap|cdot|times|simeq|approx',
		typst: 'parallel|perp|partial|nabla|planck|ell|oo|times|emptyset|exists|forall|without|not|and|or|union|inter|approx'
	}
};
