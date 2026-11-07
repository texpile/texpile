import type { Node } from 'prosemirror-model';
import { Selection } from 'prosemirror-state';

function isProse(sel: Selection): boolean {
	return sel.$from.parent.type.name !== 'raw_latex' && !sel.$from.parent.type.spec.code;
}

/** the end of the text block before `pos`, else the start of the next one; raw blocks are skipped, since typing there edits source */
export function caretAfterDelete(doc: Node, pos: number): Selection {
	for (const dir of [-1, 1]) {
		let sel = Selection.findFrom(doc.resolve(pos), dir, true);
		while (sel && !isProse(sel)) sel = Selection.findFrom(doc.resolve(dir < 0 ? sel.$from.before() : sel.$from.after()), dir, true);
		if (sel) return sel;
	}
	return Selection.near(doc.resolve(pos), -1);
}
