// the supplement field's text as the reference holds it: typst markup, which the brackets of
// `@target[...]` must still close around
import type { Node } from 'prosemirror-model';
import { escTypst } from '$lib/languages/typst/visual/core';

/** whether `@target[supplement]` reads back as a reference carrying exactly this supplement */
function readsBack(supplement: string, parse: (source: string) => Node): boolean {
	try {
		const para = parse(`@x[${supplement}]`).firstChild;
		return para?.childCount === 1 && para.child(0).type.name === 'typ_ref' && para.child(0).attrs.supplement === supplement;
	} catch {
		return false;
	}
}

/** what the field writes: the text as typed while it reads back as the supplement, else escaped to
 *  plain text, so a stray bracket cannot end the reference early; an empty field is no supplement */
export function supplementFromField(text: string, parse: (source: string) => Node): string | null {
	if (text === '') return null;
	return readsBack(text, parse) ? text : escTypst(text);
}
