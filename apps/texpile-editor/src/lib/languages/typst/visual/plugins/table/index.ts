import {
	bareTableSettingsPlugin,
	tableCaretPlugin,
	tableRulesPlugin,
	typstTableWrapperView,
	type TypstPlugin
} from '$lib/languages/typst/visual/core';
import { tableDocument } from './document';
import { tableFace } from './tableFace';
import { tableKeys } from './tableKeys';
import { typstHeaderRows } from './typstHeaderRows';
import { tableInserts } from './tableInsert';
import { typstTableLook } from './rules/typstTableEdges';

export const table: TypstPlugin = {
	role(use) {
		const scope = use.entry?.scope;
		return (
			use.form === 'call' && use.origin === 'std' && !!scope && ['cell', 'hline', 'vline'].every((member) => Object.hasOwn(scope, member))
		);
	},
	face: (core) => tableFace(core.source, core),
	document: tableDocument,
	views: () => ({
		table_wrapper: (node, view, getPos, decorations) => typstTableWrapperView(node, view, getPos as () => number, decorations)
	}),
	editorPlugins: {
		atStart: tableKeys,
		afterTableEditing: () => [typstHeaderRows, tableRulesPlugin(typstTableLook), tableCaretPlugin(), bareTableSettingsPlugin('typst')]
	},
	insert: tableInserts
};
