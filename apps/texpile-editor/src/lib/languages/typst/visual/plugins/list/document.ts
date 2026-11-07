import { indentAfterFirstLine, type TypstDocumentPlugin } from '$lib/languages/typst/visual/core/document';
import { listSeg } from './listImport';

export const listDocument: TypstDocumentPlugin = {
	import: { markup: { blocks: { ListItem: listSeg, EnumItem: listSeg } } },
	// typNumber: the explicit "5." an enum item was written with (null for "+"); order stays the
	// display counter flat-list reads
	schema: ({ nodes, marks }) => {
		const list = nodes.get('list')!;
		return { nodes: nodes.update('list', { ...list, attrs: { ...list.attrs, typNumber: { default: null } } }), marks };
	},
	save: {
		nodes: {
			list(node, _ctx, core) {
				const kind = String(node.attrs.kind ?? 'bullet');
				// the explicit "5." the source wrote comes back as written; otherwise '+' auto-numbers
				// and only a run starting off the natural count needs its marker (order is 1 on every
				// non-first node of a run, by the importer's contract)
				const order = Number(node.attrs.order ?? 1);
				const explicit = typeof node.attrs.typNumber === 'number' ? node.attrs.typNumber : null;
				const marker = kind === 'ordered' ? (explicit != null ? `${explicit}. ` : order !== 1 ? `${order}. ` : '+ ') : '- ';
				// continuation lines must sit past the marker to stay inside the item
				const body = indentAfterFirstLine(core.blocks(node) || '', ' '.repeat(marker.length));
				return marker + body + '\n\n';
			}
		},
		ownLines: (node) => node.type.name === 'list',
		tight: (prev, next, nested) =>
			next.type.name === 'list' &&
			((prev.type.name === 'list' && prev.attrs.kind === next.attrs.kind) || (nested && prev.type.name === 'paragraph'))
	}
};
