// what an import hands a plugin: the walk and the builders, bound to the import
import { buildNode, collapseTextNodes, textNode, textNodes } from '../../builders';
import type { LatexImportCore } from '$lib/languages/latex/visual/core/plugin/latexDocumentPlugin';
import type { TreeImport } from './treeImport';
import { chipOf, rawBlockOf } from './importChips';
import { inlineOf, readCallAt } from '../convert/inlineTree';
import { blocksOf } from '../convert/blocksTree';
import { environmentOf, holdsNonMath } from '../convert/blockUnits';
import { containsTabularIn, isBlankStretchOf, unitsIn, unitsInline } from '../convert/bodyUnits';
import { styleArgument } from '../convert/textStyleRuns';

/** the import of a body, its core bound to it */
export function importOf(fields: Omit<TreeImport, 'core'>): TreeImport {
	const im = fields as TreeImport;
	im.core = coreOf(im);
	return im;
}

function coreOf(im: TreeImport): LatexImportCore {
	return {
		inline: (s, ctx) => inlineOf(im, s, ctx),
		blocks: (s, lead) => blocksOf(im, s, lead),
		node: buildNode,
		text: textNode,
		texts: textNodes,
		collapse: collapseTextNodes,
		chip: (span, ctx, text) => chipOf(im, span, ctx, text),
		raw: (span, text) => rawBlockOf(im, span, text),
		readCall: (cursor, piece) => readCallAt(im, cursor, piece),
		environment: (node) => environmentOf(im, node),
		unitsIn: (s) => unitsIn(im, s),
		unitsInline: (units, ctx) => unitsInline(im, units, ctx),
		containsTabular: (s) => containsTabularIn(im, s),
		isBlankStretch: (s) => isBlankStretchOf(im, s),
		holdsNonMath: (node) => holdsNonMath(im, node),
		styleArgument: (call, ctx) => styleArgument(im, call, ctx)
	};
}
