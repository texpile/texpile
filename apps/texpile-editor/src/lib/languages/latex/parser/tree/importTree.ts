// LaTeX to editor nodes, read off the Lezer tree
import { buildNode, type ConversionOptions, type PmNode } from '../builders';
import { mergeAdjacentRawBlocks } from '$lib/editor/visual/mergeRawBlocks';
import { collectMap } from '$lib/editor/visual/sourceSpans';
import { rememberParseMap } from '$lib/editor/visual/parseOrigins';
import { drawnCommand } from '$lib/languages/latex/drawnCommands';
import { startsTitleBlock } from '$lib/languages/latex/titleParts';
import { BASE_PACKAGE_TABLE } from '../signatures/packageTable';
import { codeOnly } from '../../texCode';
import { primitiveDefsIn } from '../../userDefinitions';
import { extractUserDefinitions } from '../../intellisense/completion/userMacroScan';
import { ownMathOf } from '../../syntax/ownMath';
import { latexParserFor } from '../../syntax/latexTrees';
import { hasUnreadBody } from '../../knowledge/environments/envFacts';
import { withDocumentEnvironments } from '../signatures/documentEnvironments';
import { readByPlugin } from '$lib/languages/latex/visual/core/plugin/documentMap';
import { importReadingsOf } from './walk/importReadings';
import { bodyOf } from './walk/stretch';
import { blocksOf } from './convert/blocksTree';
import { convertsItself } from './convert/inlineTree';
import { importOf } from './importCore/importCore';

// \def\bea#1\eea{...}: a call of \bea takes everything up to \eea
function delimitedPairsIn(code: string): Map<string, string> {
	return new Map(primitiveDefsIn(code).flatMap((d) => (d.delimiter ? [[d.name, d.delimiter]] : [])));
}

export function treeToProseMirror(latex: string, given: ConversionOptions = {}): { doc: PmNode } {
	const preamble = given.preamble ?? '';
	const options = { ...given, table: withDocumentEnvironments(given.table, `${preamble}\n${latex}`) };
	const definitions = extractUserDefinitions(`${preamble}\n${latex}`);
	// a loaded file's environment whose body TeX takes as written (smfart's abstract) reads as written too
	const tableUnread = Object.entries(options.table?.bodies ?? {}).flatMap(([name, facts]) => (hasUnreadBody(facts) ? [name] : []));
	const literals = { ...definitions.literals, unread: [...new Set([...definitions.literals.unread, ...tableUnread])] };
	const tree = latexParserFor(false, { math: ownMathOf(definitions), literals }).parse(latex);
	options.onPhase?.('building');
	const im = importOf({
		src: latex,
		readings: importReadingsOf({
			table: options.table,
			body: latex,
			preamble,
			tree,
			known: (name) => convertsItself(name) || readByPlugin(name)
		}),
		options,
		lists: [],
		listKeys: new Map(),
		delimited: delimitedPairsIn(codeOnly(`${preamble}\n${latex}`))
	});
	const blocks = blocksOf(im, bodyOf(tree.topNode));
	const titleTable = options.table ?? BASE_PACKAGE_TABLE;
	const doc = mergeAdjacentRawBlocks(
		buildNode('doc', null, blocks.length > 0 ? blocks : [buildNode('paragraph')]),
		latex,
		(source) => drawnCommand(source) || startsTitleBlock(source, titleTable)
	);
	rememberParseMap(doc, collectMap(doc), { text: latex, from: 0, to: latex.length }, false);
	return { doc };
}
