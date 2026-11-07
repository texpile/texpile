import { typstTableWrapperView, type TypstPlugin } from '$lib/languages/typst/visual/core';
import { tableDocument } from './document';
import { tableFace } from './tableFace';
import { tableKeys } from './tableKeys';
import { typstHeaderRows } from './typstHeaderRows';
import { tableInserts } from './tableInsert';

export const table: TypstPlugin = {
	role(use) {
		const scope = use.entry?.scope;
		return (
			use.form === 'call' && use.origin === 'std' && !!scope && ['cell', 'hline', 'vline'].every((member) => Object.hasOwn(scope, member))
		);
	},
	face: (core) => tableFace(core.source, core),
	document: tableDocument,
	// the shared table wrapper chrome (Table N header, gear with label + verbatim columns)
	// in typst mode: every LaTeX-only control is gated off inside
	views: () => ({ table_wrapper: (node, view, getPos) => typstTableWrapperView(node, view, getPos as () => number) }),
	editorPlugins: { atStart: tableKeys, afterTableEditing: () => [typstHeaderRows] },
	insert: tableInserts
};
