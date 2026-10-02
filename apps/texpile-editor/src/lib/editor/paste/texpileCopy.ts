// A copy from Texpile's own visual editors: marked when it is made, so a paste can keep all of it. Not
// ProseMirror's slice marker, which every ProseMirror or Tiptap app writes too.
import { DOMSerializer, type Fragment, type Schema } from 'prosemirror-model';
import { addCopiedMathLatex } from './pastedMath';

const COPY_MARK = 'data-texpile-copy';

export function isTexpileCopy(html: string): boolean {
	return html.includes(COPY_MARK);
}

class MarkingSerializer extends DOMSerializer {
	override serializeFragment(fragment: Fragment, options: { document?: Document } = {}, target?: HTMLElement | DocumentFragment) {
		const dom = super.serializeFragment(fragment, options, target);
		// the top level only: node content comes back through here with its own target
		if (target) return dom;
		for (const child of dom.childNodes) if (child.nodeType === 1) (child as Element).setAttribute(COPY_MARK, '');
		addCopiedMathLatex(dom);
		return dom;
	}
}

/** the editor's own clipboard HTML, marked as Texpile's */
export function texpileClipboardSerializer(schema: Schema): DOMSerializer {
	const own = DOMSerializer.fromSchema(schema);
	return new MarkingSerializer(own.nodes, own.marks);
}
