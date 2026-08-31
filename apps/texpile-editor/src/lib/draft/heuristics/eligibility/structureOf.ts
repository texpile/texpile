// Everything in a block that is NOT running text, printed back to source.
//
// `string` and `whitespace` are the text; every other node -- macro, group, environment,
// math, verbatim, comment, parbreak -- is structure and must survive the edit byte for byte.
// Dropping whitespace from the comparison is what lets a word be typed: "a b" -> "a big b"
// changes the node COUNT, so a positional walk over the raw list refuses every real edit.
//
// printRaw rather than a hand-written deep compare: it serialises whatever the parser built,
// including argument binding and the raw spans heuristicMarkTexPrimitiveDefs captures for
// \def/\gdef/\let, so a node shape nobody enumerated here still compares correctly.
import { printRaw } from '@unified-latex/unified-latex-util-print-raw';
import type { Node } from '@unified-latex/unified-latex-types';

const TEXT = new Set(['string', 'whitespace']);

// `\par` is exempt because it is OURS, not the user's: the merged-insert path dispatches
// prev + \par + run as one unit so the engine sets the paragraph spacing itself, and a
// paragraph the USER splits is caught upstream as a structural edit and never arrives here.
// The layout it implies is the certificate's question, not this gate's.
const ours = (n: Node) => n.type === 'macro' && (n as { content?: unknown }).content === 'par';

export function structureOf(nodes: Node[]): string[] {
	// A comment's CONTENT never becomes ink and this project rejects semantic comments, so
	// editing inside one is a text edit -- but its PRESENCE stays structural: a trailing %
	// eats the newline and rejoins words, so adding or removing one must still refuse.
	return nodes.filter((n) => !TEXT.has(n.type) && !ours(n)).map((n) => (n.type === 'comment' ? '%' : printRaw(n)));
}
