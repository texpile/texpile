import type { Tree } from '@lezer/common';
import { buildNode, textNodes, type PmNode } from './builders';
import { collectMap } from '$lib/editor/visual/sourceSpans';
import { rememberParseMap } from '$lib/editor/visual/parseOrigins';
import { markdownParser } from '../syntax/markdownSyntax';
import { ensureBlocks, readNested, readTopLevel } from './convert/blockReader';
import { gapText, readInline } from './convert/inlineReader';
import { titleText } from './convert/destinations';
import { chip, withMarks } from './convert/inlineParts';
import { rawBlock } from './convert/rawBlocks';
import { childNamed, childrenOf, normalizeLabel, type Definition, type Reader } from './convert/reader';
import { SourceText } from './convert/sourceText';

export type MarkdownParseResult = {
	doc: PmNode;
};

function definitionsOf(tree: Tree, text: string): Map<string, Definition> {
	const out = new Map<string, Definition>();
	tree.iterate({
		enter(node) {
			if (node.name !== 'LinkReference') return;
			const label = childNamed(node.node, 'LinkLabel');
			const url = childNamed(node.node, 'URL');
			if (!label || !url) return false;
			const key = normalizeLabel(text.slice(label.from + 1, label.to - 1));
			const title = childNamed(node.node, 'LinkTitle');
			if (!out.has(key))
				out.set(key, { href: text.slice(url.from, url.to), title: title ? titleText(text.slice(title.from, title.to)) : null });
			return false;
		}
	});
	return out;
}

export function markdownToProseMirror(source: string): MarkdownParseResult {
	const src = new SourceText(source);
	const tree = markdownParser.parse(src.text);
	const r: Reader = {
		src,
		definitions: definitionsOf(tree, src.text),
		blocks: readNested,
		inline: readInline,
		gap: gapText,
		raw: (cur, lang, node) => rawBlock(lang)(cur, node),
		node: buildNode,
		texts: textNodes,
		withMarks,
		chip,
		ensureBlocks,
		prefixes: [],
		baseColumn: 0
	};
	const blocks = readTopLevel(r, childrenOf(tree.topNode));
	// a file that is CRLF throughout gets its regenerated blocks written the same way
	const eol = source.includes('\r\n') && !/(^|[^\r])\n/.test(source) ? '\r\n' : null;
	const doc = buildNode('doc', { eol }, ensureBlocks(blocks));
	// the document knows its blocks' gaps and constructs from here; parseMarkdownFile registers it
	// against the file, where the bytes are written back from
	rememberParseMap(doc, collectMap(doc), { text: source, from: 0, to: source.length }, false);
	return { doc };
}
