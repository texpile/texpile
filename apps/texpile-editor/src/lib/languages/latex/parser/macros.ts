// deterministic macro config for the converter: what gets dropped (ignoredMacros), what is
// preserved-as-raw (SCOPED_SWITCHES), and the argument signatures fed to the parser so args
// attach. the best-effort guessing lives in heuristics.ts.
import type { Node } from '@unified-latex/unified-latex-types';

/**
 * Macros dropped entirely. ONLY genuinely no-output commands belong here: anything that affects
 * rendering must fall through to raw and round-trip verbatim instead. that includes \vspace and
 * friends, \setlength, definition macros (\newcommand, \documentclass, ...), \label (dropping
 * one silently breaks \ref/\cref), \pagenumbering, and \makeatletter/\makeatother (the @ catcode
 * is load-bearing for any @-named command inside; dropping the wrapper broke compilation).
 */
export const ignoredMacros = new Set([
	'indent',
	// \centering and the skips are NOT here: they change rendering, and outside a float (a
	// minipage, a page of prose) nothing re-emits them. inside a table float the extractor
	// drops the ones the wrapper serializer emits itself, so they cannot compound
	// size switches (\large, \small, ...) are NOT here: dropping them changes rendering. the one
	// compounding case (the table-notes serializer's own {\small ...}) is stripped structurally
	// in extractTableComponents, not by a document-wide drop.
	'def',
	'let',
	'ifdefempty'
]);

/**
 * Macros with no handler whose ENTIRE node (name + args) is rebuilt by one printRaw call and
 * never re-walked downstream. the heuristics must NOT recurse into these args: stamping `_raw`
 * or splicing siblings inside only deletes content from printRaw's view (a nested \edef in a
 * \renewcommand body collapsed to a bare \edef). keep the list narrow: recursing IS the correct
 * default for everything else (\multicolumn/\multirow cell content genuinely is re-walked, and
 * restricting recursion unconditionally regressed \makecell losing its braces).
 */
export const RAW_WHOLESALE_ARG_MACROS = new Set([
	// definition/structural macros
	'documentclass',
	'usepackage',
	'newcommand',
	'renewcommand',
	'providecommand',
	'newenvironment',
	'renewenvironment',
	'DeclareRobustCommand',
	// frontmatter/body macros that fall through to raw whole (see converter.ts macroHandlers)
	'footnote',
	'title',
	'author',
	'date',
	'thanks',
	'maketitle'
]);

/**
 * The four smallest size switches, named separately because extractTableComponents strips
 * exactly this subset from table NOTES (the notes serializer emits its own {\small ...}, which
 * would compound). everywhere else they round-trip like any SCOPED_SWITCHES member.
 */
export const FONT_SIZE_SWITCHES = new Set(['tiny', 'scriptsize', 'footnotesize', 'small']);

/**
 * Switches whose effect is scoped to the enclosing group ({\large ...}, {\color{red} ...}).
 * preserved verbatim, never dropped; a {...} group scoping one is kept whole so it can't leak.
 */
export const SCOPED_SWITCHES = new Set([
	...FONT_SIZE_SWITCHES,
	'normalsize',
	'large',
	'Large',
	'LARGE',
	'huge',
	'Huge',
	'bfseries',
	'mdseries',
	'itshape',
	'upshape',
	'slshape',
	'scshape',
	'rmfamily',
	'sffamily',
	'ttfamily',
	'normalfont',
	'em',
	'bf',
	'it',
	'tt',
	'sc',
	'sf',
	'rm',
	'color',
	'normalcolor',
	'sethlcolor',
	'centering',
	'raggedright',
	'raggedleft'
]);

/** the node a stripped trailing comment followed, which a raw block takes back (see convertNodesToBlocks) */
export type SameLineCommented = Node & { _sameLineComment?: Node };

/**
 * Drop trailing ("sameline") comments from the AST in place: they're dropped on conversion
 * anyway, and removing them lets a command's args attach across them. calls where the comments
 * matter are captured verbatim first by heuristicMarkCommentedMacroCalls.
 */
export function stripSamelineComments(nodes: Node[] | undefined): void {
	if (!Array.isArray(nodes)) return;
	for (let i = nodes.length - 1; i >= 0; i--) {
		const n = nodes[i];
		if (n.type === 'comment' && n.sameline) {
			const owner = nodes[i - 1]?.type === 'whitespace' ? nodes[i - 2] : nodes[i - 1];
			if (owner) (owner as SameLineCommented)._sameLineComment = n;
			// the tokenizer folds the space before `%` into the comment; TeX keeps that space and
			// eats the newline, so `A % c` + newline + `B` is "A B", never "AB"
			const keepsSpace = n.leadingWhitespace && i > 0 && nodes[i - 1].type !== 'whitespace';
			nodes.splice(i, 1, ...(keepsSpace ? [{ type: 'whitespace' } as Node] : []));
			continue;
		}
		if ('content' in n && Array.isArray(n.content)) stripSamelineComments(n.content);
		if ('args' in n && Array.isArray(n.args)) for (const a of n.args) stripSamelineComments(a.content);
	}
}
