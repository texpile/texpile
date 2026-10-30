// what a document says itself about its numbers
import { definitionsIn } from '$lib/languages/latex/knowledge/calls/definitions';
import { primitiveDefsIn } from '$lib/languages/latex/userDefinitions';
import { blankComments } from '$lib/languages/latex/texCode';
import { commonEnvNames, envNameAlternation } from '$lib/languages/latex/knowledge/environments/envFacts';

const STYLE = '(arabic|Roman|roman|Alph|alph|fnsymbol)';
const PART = new RegExp(
	String.raw`\\the([a-zA-Z]+)|\\${STYLE}\s*\{([a-zA-Z]+)\}|\\@${STYLE}\s*\\c@([a-zA-Z]+)|\\[a-zA-Z@]+\s*|[{}]|[^\\{}]+`,
	'g'
);
// what a reader sees nothing of
const SILENT = /^\\(protect|mbox|relax|ignorespaces)\s*$/;
// the environments that print a number (dmath, IEEEeqnarray) and empheq, which takes one from the environment it wraps
export const NUMBERED_MATH_ENVIRONMENTS = [...commonEnvNames((facts) => !!facts.numbering), 'empheq'];
// \def\beq{\equation} opens one as \begin does
export const NUMBERED_MATH = new RegExp(
	String.raw`\\begin\s*\{(${envNameAlternation(NUMBERED_MATH_ENVIRONMENTS)})\}|\\(equation|eqnarray|align|gather|multline|flalign|alignat)(?![a-zA-Z@*])`
);

/** the macros and environments a document defines that open numbered math, which the editor shows as source */
export type MathOpeners = { macros: readonly string[]; environments: readonly string[] };

/** the form a \the<counter> body prints, as numberForms reads one; null when it does more than print counters */
export function formOfBody(counter: string, body: string): string | null {
	let form = '';
	for (const m of body.matchAll(PART)) {
		if (m[1]) form += `{${m[1]}}`;
		else if (m[2] || m[4]) {
			const style = m[2] ?? m[4];
			const of = m[3] ?? m[5];
			form += of === counter ? `[${style}]` : `{${of}}`;
		} else if (m[0] === '{' || m[0] === '}' || SILENT.test(m[0])) continue;
		else if (m[0].startsWith('\\')) return null;
		else form += m[0];
	}
	return form.includes('[') ? form.trim() : null;
}

/** `keep`: which definitions count, by where their call starts */
function definitionsOf(text: string, keep: (at: number) => boolean = () => true): { name: string; body: string }[] {
	const code = blankComments(text);
	return [
		...definitionsIn(code).flatMap((d) =>
			d.kind === 'macro' && d.body !== undefined && keep(d.at) ? [{ name: d.name, body: d.body }] : []
		),
		...primitiveDefsIn(code).flatMap((d) => (d.body !== null && keep(d.at) ? [{ name: d.name, body: d.body }] : []))
	];
}

/** the forms `text` gives counters, in order; null for a counter it redefines past reading */
export function definedFormsIn(text: string, keep?: (at: number) => boolean): { counter: string; form: string | null }[] {
	if (!/\\the[a-zA-Z]/.test(text)) return [];
	return definitionsOf(text, keep).flatMap(({ name, body }) => {
		const counter = /^the([a-zA-Z]+)$/.exec(name)?.[1];
		return counter ? [{ counter, form: formOfBody(counter, body) }] : [];
	});
}

export function mathOpenersIn(text: string): MathOpeners {
	const code = blankComments(text);
	return {
		macros: definitionsOf(text).flatMap(({ name, body }) => (NUMBERED_MATH.test(body) ? [name] : [])),
		environments: definitionsIn(code).flatMap((d) =>
			d.kind === 'environment' && d.body !== undefined && NUMBERED_MATH.test(d.body) ? [d.name] : []
		)
	};
}

export function mergeOpeners(all: MathOpeners[]): MathOpeners {
	return { macros: all.flatMap((o) => o.macros), environments: all.flatMap((o) => o.environments) };
}

export function definesFootnoteIn(text: string): boolean {
	return /\\footnote\b/.test(text) && definitionsOf(text).some((d) => d.name === 'footnote');
}
