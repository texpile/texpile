import { tableCaretPlugin, tableRulesPlugin, tableWrapperView, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { inlineTabularPart, isTextTable } from './inlineTabularFace';
import { tableDocument } from './document';
import { longtablePlugin } from './longtable/longtablePlugin';
import { latexTableLook } from './rules/tableRuleEdges';
import { tableInserts } from './tableInsert';

export const table: LatexPlugin = {
	role: { environments: isTextTable },
	face: (part, core) =>
		part.kind === 'environment' ? inlineTabularPart(part.node, core.src, { unitsOf: core.unitsOf, draw: core.drawUnits }) : undefined,
	document: tableDocument,
	views: () => ({ table_wrapper: tableWrapperView }),
	editorPlugins: { beforeWordCount: () => [longtablePlugin(), tableRulesPlugin(latexTableLook), tableCaretPlugin()] },
	insert: tableInserts
};
