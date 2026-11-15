// a #bibliography(...) raw island, drawn by the same card as LaTeX's \printbibliography. The island's TEXT stays
// verbatim (the card never edits the node), so the .typ round-trips unchanged.
import type { BibliographyKind } from '$lib/editor/visual/extensions/bibliography/bibliographyNodeView.svelte';
import { namedArg, readTypstCall, typstSyntax, type TypstCall } from '../core/reading/typstCall';
import { unquoted } from '../../syntax/typstCalls';

// the call the chip opens with; a label after it (`#bibliography(..) <refs>`) is the chip's own
function bibliographyCall(text: string): TypstCall | null {
	const source = text.trim();
	const hash = typstSyntax(source).firstChild;
	const call = hash?.nextSibling;
	if (hash?.name !== 'Hash' || call?.name !== 'FuncCall') return null;
	const read = readTypstCall(source.slice(hash.from, call.to));
	return read?.form === 'call' && read.name === 'bibliography' ? read : null;
}

export function isTypstBibliography(text: string): boolean {
	return bibliographyCall(text) !== null;
}

/** The heading from `title: "..."`, or the default typst uses. */
function typBibHeading(text: string): string {
	const call = bibliographyCall(text);
	const title = call && namedArg(call, 'title');
	return title?.kind === 'Str' ? unquoted(title.value) : 'Bibliography';
}

export const typstBibliography: BibliographyKind = { owns: isTypstBibliography, heading: typBibHeading };
