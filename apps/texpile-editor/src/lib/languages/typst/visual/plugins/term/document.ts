import type { Node } from 'prosemirror-model';
import { indentAfterFirstLine, type TypstDocumentPlugin } from '$lib/languages/typst/visual/core/document';
import { termSeg } from './termImport';
import { termItemSpec, termTitleSpec } from './termSchema';

function isTerm(node: Node): boolean {
	return node.type.name === 'term_item';
}

export const termDocument: TypstDocumentPlugin = {
	import: { markup: { blocks: { TermItem: termSeg } } },
	schema: ({ nodes, marks }) => ({
		nodes: nodes.addBefore('typ_ref', 'term_title', termTitleSpec).addToEnd('term_item', termItemSpec),
		marks
	}),
	save: {
		nodes: {
			// a title written on its own, inside the frame of the item that holds it
			term_title: (node, _ctx, core) => core.inline(node, false, ':', true),
			term_item(node, _ctx, core) {
				const title = node.childCount > 0 && node.child(0).type.name === 'term_title' ? node.child(0) : null;
				const desc = core.blocks(node, title ? 1 : 0);
				// the first unescaped colon ends the term, so one in the title is escaped
				return `/ ${title ? core.inline(title, false, ':', true) : ''}: ${indentAfterFirstLine(desc, '  ')}\n\n`;
			}
		},
		// the colon ending a term is structure
		runs: { term_title: { write: (run, core) => core.inline(run, false, ':', true), structure: ':' } },
		ownLines: isTerm,
		tight: (prev, next) => isTerm(prev) && isTerm(next)
	}
};
