// Vendors unified-latex's LaTeX tokenizer grammar with its result memo kept only for the rules an opener starts: the
// packaged memo holds about 1.5 KB per source byte, and with none an unclosed \begin inside groups takes exponential
// time. A kept rule stores a failure only where it could start (a \begin, a {, a \). The parse is upstream's, byte for byte.
// Run after upgrading @unified-latex/unified-latex-util-pegjs:  node scripts/vendor-latex-peg.mjs
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '..', 'package.json'));
// resolved through unified-latex-util-parse, which depends on it; the app itself does not
const parseEntry = require.resolve('@unified-latex/unified-latex-util-parse');
const pegEntry = createRequire(parseEntry).resolve('@unified-latex/unified-latex-util-pegjs');
const pegPkg = dirname(pegEntry);
const bundle = readFileSync(join(pegPkg, 'index.js'), 'utf8');
const version = JSON.parse(readFileSync(join(pegPkg, 'package.json'), 'utf8')).version;

const lines = bundle.split('\n');
const start = lines.findIndex((l) => l.startsWith('var latex_default = (function() {'));
const next = lines.findIndex((l, i) => i > start && /^var [a-z_]+_default = \(function\(\) \{/.test(l));
if (start < 0 || next < 0) throw new Error('the latex grammar module was not found in the bundle');
const helpers = lines.slice(0, start).join('\n');
let grammar = lines.slice(start, next).join('\n');

// the rules that keep their memo, each with the test for a position the rule could start at
const KEPT = {
	environment: "input.substr(peg$currPos, 6) === '\\\\begin'",
	math_environment: "input.substr(peg$currPos, 6) === '\\\\begin'",
	group: 'input.charCodeAt(peg$currPos) === 123',
	// \[ \( and \lstinline[ scan to the end of the file when left open
	special_macro: 'input.charCodeAt(peg$currPos) === 92',
	square_bracket_argument: 'input.charCodeAt(peg$currPos) === 91'
};
const lookup =
	/\n\t*const key = peg\$currPos \* \d+ \+ \d+;\n\t*const cached = peg\$resultsCache\[key\];\n\t*if \(cached\) \{\n\t*peg\$currPos = cached\.nextPos;\n\t*return cached\.result;\n\t*\}/g;
const store = /\n\t*peg\$resultsCache\[key\] = \{\n\t*nextPos: peg\$currPos,\n\t*result: s0\n\t*\};/g;
const lookups = (grammar.match(lookup) ?? []).length;
const stores = (grammar.match(store) ?? []).length;
if (lookups === 0 || lookups !== stores) throw new Error(`memo shape not recognised: ${lookups} lookups, ${stores} stores`);
const kept = new Set();
grammar = grammar
	.split(/(?=\n\t*function peg\$parse[A-Za-z_]+\(\) \{)/)
	.map((part) => {
		const rule = /function peg\$parse([A-Za-z_]+)\(\)/.exec(part)?.[1];
		if (!rule || !KEPT[rule]) return part.replace(lookup, '').replace(store, '');
		kept.add(rule);
		// after a failure the rule has put peg$currPos back where it started
		return part.replace(store, (s) =>
			s.replace('peg$resultsCache[key] =', `if (s0 !== peg$FAILED || ${KEPT[rule]}) peg$resultsCache[key] =`)
		);
	})
	.join('');
if (kept.size !== Object.keys(KEPT).length) throw new Error(`rules not found: ${Object.keys(KEPT).filter((r) => !kept.has(r))}`);
const left = grammar.split('peg$resultsCache').length - 1;
if (left !== 1 + 2 * kept.size) throw new Error(`memo references left: ${left}`);

// the environment names read as verbatim or as math come with each parse (options.verbatimEnvs,
// options.verbatimOptionalArgEnvs, options.mathEnvs); without them, upstream's lists in upstream's order, first match wins
const NAME_RULES = {
	verbatim_env_name: 'peg$verbatimEnvs',
	verbatim_env_name_allows_optional_arg: 'peg$verbatimOptionalArgEnvs',
	math_env_name: 'peg$mathEnvs'
};
// the plain-word constants only: the names are letters and a star
const constants = Object.fromEntries([...grammar.matchAll(/const (peg\$c\d+) = "([A-Za-z*]+)";/g)].map((m) => [m[1], m[2]]));
const defaults = {};
for (const [rule, set] of Object.entries(NAME_RULES)) {
	const re = new RegExp(`\\n(\\t*)function peg\\$parse${rule}\\(\\) \\{[\\s\\S]*?\\n\\1\\}`);
	const match = re.exec(grammar);
	if (!match) throw new Error(`rule ${rule} not found`);
	const names = [...new Set([...match[0].matchAll(/peg\$c\d+/g)].map((m) => constants[m[0]]))];
	if (!names.length) throw new Error(`rule ${rule} names no environments`);
	defaults[set] = names;
	const wrap = /return createNode\("string"/.test(
		grammar.slice(grammar.indexOf(`function peg$f${/s1 = peg\$f(\d+)\(s1\)/.exec(match[0])?.[1]}(`)).slice(0, 200)
	);
	const make = /s1 = (peg\$f\d+)\(s1\)/.exec(match[0])?.[1];
	const tab = match[1];
	const body = make
		? `${tab}function peg$parse${rule}() {\n${tab}\tconst s0 = peg$currPos;\n${tab}\tconst s1 = peg$envNameIn(${set});\n${tab}\tif (s1 === peg$FAILED) return s1;\n${tab}\tpeg$savedPos = s0;\n${tab}\treturn ${make}(s1);\n${tab}}`
		: `${tab}function peg$parse${rule}() {\n${tab}\treturn peg$envNameIn(${set});\n${tab}}`;
	if (make && !wrap) throw new Error(`rule ${rule} builds its result unexpectedly`);
	grammar = grammar.replace(match[0], `\n${body}`);
}
const optionsLine = 'options = options !== void 0 ? options : {};';
if (!grammar.includes(optionsLine)) throw new Error('the options line was not found');
grammar = grammar.replace(
	optionsLine,
	`${optionsLine}\n${Object.entries(defaults)
		.map(([set, names]) => `\t\tconst ${set} = options.${set.slice(4)} ?? ${JSON.stringify(names)};`)
		.join(
			'\n'
		)}\n\t\tfunction peg$envNameIn(names) {\n\t\t\tfor (const name of names) if (input.startsWith(name, peg$currPos)) {\n\t\t\t\tpeg$currPos += name.length;\n\t\t\t\treturn name;\n\t\t\t}\n\t\t\treturn peg$FAILED;\n\t\t}`
);

const out = `// GENERATED by scripts/vendor-latex-peg.mjs from @unified-latex/unified-latex-util-pegjs@${version}
// (MIT, (c) Jason Siefken and contributors): the LaTeX tokenizer grammar, its result memo kept only
// for the rules an opener starts. Do not edit; rerun the script after upgrading the package.
/* eslint-disable */
${helpers}
${grammar}
export const parse = latex_default.parse;
export const PegSyntaxError = latex_default.SyntaxError;
`;
const target = join(here, '..', 'src', 'lib', 'languages', 'latex', 'parser', 'vendor', 'latexPeg.js');
writeFileSync(target, out);
console.log(
	`wrote ${target}: memo kept for ${[...kept].join(', ')}, ${lookups - kept.size} rules without it, names from options for ${Object.keys(NAME_RULES).join(', ')} (${out.length} bytes)`
);
