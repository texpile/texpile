import {
	bareTableSettingsPlugin,
	tableCaretPlugin,
	tableRulesPlugin,
	typstTableWrapperView,
	type TypstPlugin
} from '$lib/languages/typst/visual/core';
import { tableDocument } from './document';
import { tableFace } from './drawn/tableFace';
import { isTablexName } from './drawn/tablexWords';
import { tableKeys } from './tableKeys';
import { typstHeaderRows } from './typstHeaderRows';
import { tableInserts } from './tableInsert';
import { typstTableLook } from './rules/typstTableLook';

export const table: TypstPlugin = {
	role(use) {
		if (use.form !== 'call') return false;
		const scope = use.entry?.scope;
		if (use.origin === 'std' && scope) return ['cell', 'hline', 'vline'].every((member) => Object.hasOwn(scope, member));
		return isTablexName(use.name);
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
