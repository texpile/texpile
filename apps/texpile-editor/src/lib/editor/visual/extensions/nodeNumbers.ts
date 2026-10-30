// the numbers a language hands a node view on its decorations, which the view draws as given
import type { Decoration } from 'prosemirror-view';

/** null when the language hands none, and the view counts them itself */
export function compiledNumbersOf(decorations: readonly Decoration[]): string[] | null {
	for (const d of decorations) if (Array.isArray(d.spec.numbers)) return d.spec.numbers as string[];
	return null;
}
