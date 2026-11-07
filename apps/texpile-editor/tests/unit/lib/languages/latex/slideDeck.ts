// a beamer deck as the app parses it: with the package table its class gives, which is what reads frames and overlays
import type { Node } from 'prosemirror-model';
import { parseLatexFile, type ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
import { parsedPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { packageTableOf, type PackageTable } from '$lib/languages/latex/parser/signatures/packageTable';

export const DECK = `\\documentclass{beamer}
\\title[Short]{A \\textbf{long} talk}
\\subtitle{With a subtitle}
\\author{Ada \\and Grace}
\\begin{document}

\\frame{\\titlepage}

\\begin{frame}[t]
  \\frametitle{Why overlays}
  \\framesubtitle{They reveal}
  Some text \\only<2>{appears on slide two} and \\uncover<3->{stays from three}.
  \\pause
  After the pause.
  \\begin{itemize}
    \\item<1-> First item
    \\item<2-3> Second item
  \\end{itemize}
\\end{frame}

\\begin{frame}<1-2>[fragile]{Code}{Listing}
  \\begin{columns}[T]
    \\begin{column}{0.4\\textwidth}
      Left
    \\end{column}
    \\column{.6\\textwidth}
    Right
  \\end{columns}
  \\begin{alertblock}{Careful}
    Alert text.
  \\end{alertblock}
\\end{frame}

\\end{document}
`;

export type Deck = { text: string; table: PackageTable; parsed: ParsedLatexFile };

export async function parseDeck(text: string = DECK): Promise<Deck> {
	const table = packageTableOf(await parsedPackages(text));
	return { text, table, parsed: parseLatexFile(text, '', undefined, table) };
}

export function reparse(deck: Deck, text: string): ParsedLatexFile {
	return parseLatexFile(text, '', undefined, deck.table);
}

/** the n-th node of `type` in `doc` with its position */
export function find(doc: Node, type: string, nth = 0): { node: Node; pos: number } {
	const found: { node: Node; pos: number }[] = [];
	doc.descendants((node, pos) => {
		if (node.type.name === type) found.push({ node, pos });
	});
	if (!found[nth]) throw new Error(`no ${type} node`);
	return found[nth];
}

/** the position just after `needle` in the text of `doc` */
export function endOf(doc: Node, needle: string): number {
	let at = -1;
	doc.descendants((node, pos) => {
		if (at >= 0) return false;
		const i = node.isText ? node.text!.indexOf(needle) : -1;
		if (i >= 0) at = pos + i + needle.length;
		return at < 0;
	});
	if (at < 0) throw new Error(`no text ${needle}`);
	return at;
}
