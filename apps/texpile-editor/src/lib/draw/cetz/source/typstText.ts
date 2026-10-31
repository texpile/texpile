// outside math, what Typst's markup reads as its own: emphasis, code, labels, references, brackets and escapes
const IN_MARKUP = /(?<!\\)([*_#@<[\]`\\])/g;

/** typed text as Typst's markup takes it: each character as itself, math between `$` kept as math */
export function typstText(text: string) {
	return text
		.split(/(?<!\\)(\$)/)
		.map((part, k, parts) => (parts.slice(0, k).filter((p) => p === '$').length % 2 === 1 ? part : part.replace(IN_MARKUP, '\\$1')))
		.join('');
}

/** written text as it is typed, the other way */
export function typedText(text: string) {
	return text.replace(/\\([*_#@<[\]`\\])/g, '$1');
}

/** text that would take the rest of the picture with it: an unclosed math */
export function textProblem(text: string) {
	return (text.replace(/\\\$/g, '').match(/\$/g)?.length ?? 0) % 2 ? 'Close the math: $ needs a second $' : null;
}
