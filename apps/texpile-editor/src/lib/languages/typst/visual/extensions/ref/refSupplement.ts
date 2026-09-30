// the supplement field's text as the reference holds it: typst markup, which the brackets of
// `@target[...]` must still close around
import { typstToProseMirror } from '../../convert/converter';
import { escTypst } from '../../serialize/typstInline';

/** whether `@target[supplement]` reads back as a reference carrying exactly this supplement */
function readsBack(supplement: string): boolean {
	try {
		const para = typstToProseMirror(`@x[${supplement}]`).doc.firstChild;
		return para?.childCount === 1 && para.child(0).type.name === 'typ_ref' && para.child(0).attrs.supplement === supplement;
	} catch {
		return false;
	}
}

/** what the field writes: the text as typed while it reads back as the supplement, else escaped to
 *  plain text, so a stray bracket cannot end the reference early; an empty field is no supplement */
export function supplementFromField(text: string): string | null {
	if (text === '') return null;
	return readsBack(text) ? text : escTypst(text);
}
