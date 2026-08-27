import type { Argument } from '@unified-latex/unified-latex-types';

/**
 * An argument's text, but ONLY when the argument is nothing but text - no macro, no group, no
 * comment. `getTextContent` would flatten those and hand back something that looks fine and is
 * not: \label{\thesection:intro} would become the literal name "\thesection:intro".
 *
 * Returning null is the caller's signal to keep the source verbatim instead.
 */
export function plainArgText(arg: Argument | undefined): string | null {
	if (!arg) return null;
	let out = '';
	for (const n of arg.content) {
		if (n.type === 'string') out += n.content;
		else if (n.type === 'whitespace') out += ' ';
		else return null;
	}
	const text = out.trim();
	return text.length > 0 ? text : null;
}
