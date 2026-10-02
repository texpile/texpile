// Format-neutral doc assembly: verbatim substitution over top-level blocks, shared by the LaTeX,
// Markdown and Typst serializers. Knows nothing about any syntax — it deals in what the parse
// remembers of each block (its bytes, the gap before them, its place in the parse's order) and in
// the deterministic text the dialect writes for a block the parse no longer knows.
//
// The round trip is a lens: the parse is `get`, this assembly is `put`, and `put` reads the old
// file as well as the document, never the document alone. Two laws hold it together:
//   put(file, get(file)) == file          an untouched document writes its file back byte for byte
//   get(put(file, doc)) ~ doc             what was written reads back as what was shown
// The first holds by construction: every block the parse still knows is its bytes, joined on the
// file's own gaps. The second is checked before a save (see workspace/verifiedSerialize.ts) on
// what a reader sees, since the bytes may legitimately differ from what the dialect would write;
// a block that fails it is written whole, and nothing untouched is ever regenerated for it.
import type { Node } from 'prosemirror-model';
import type { Ctx } from './types';
import type { Segment, SourceMap } from '$lib/editor/visual/sourceSpans';
import type { BlockOrigin } from '$lib/editor/visual/parseOrigins';
import { createDocAssembly } from './docAssembly';
import { createLeafSplice } from './leafSplice';
import { createMemberSplice } from './memberSplice';
import { createSegmentSplice } from './segmentSplice';
import { createVerbatimParts } from './verbatimParts';

export { blankLineAt, follows, isLastOfParse } from './blockAssemblyUtils';

/** a top-level block as the dialect hooks see it: the node, what the parse still knows it as, and
 *  what it most likely replaced when the parse no longer knows it */
export type Neighbour = { node: Node; origin: BlockOrigin | null; was: BlockOrigin | null };

export type DocSerializeResult = {
	text: string;
	/** True iff the leading bytes are the body's verbatim original leading gap; the caller
	 *  (the roundtrip glue) must NOT prepend its own separator then, or it duplicates. */
	leadProtected: boolean;
	/** Same, for the trailing edge. */
	tailProtected: boolean;
	/** The gap the body had at that edge, when the block standing there is still the one that stood
	 *  there at parse time. An EDITED edge block loses its protection but not its gap, and a caller
	 *  that falls back to a separator of its own would drop the blank line that was in the file. */
	leadGap: string | null;
	tailGap: string | null;
	trailingRegenerated: Neighbour | null;
	/** where every run and block of the doc landed in `text` */
	map: SourceMap;
};

export type BlockAssemblyOptions = {
	/**
	 * The separator between two adjacent emissions when at least one of them regenerated, or
	 * they are pristine but no longer source-adjacent. `contiguous` says whether `next` still
	 * directly followed `prev` in the source. `before` is the end of what was written so far (its
	 * last 64 characters at least). null keeps the default: a hard blank line.
	 */
	boundary?: (prev: Neighbour, next: Neighbour, contiguous: boolean, before: string) => string | null;
	/** the text of the last block written, before a blank line goes after it: what a paragraph's
	 *  end should be once something follows */
	beforeBreak?: (text: string, last: Neighbour, next: Neighbour) => string;
	/** the leaf runs of a block the dialect regenerated, against that block's own text, positions
	 *  relative to the block node; null when they could not be told apart */
	mapLeaves?: (node: Node, ctx: Ctx, text: string) => Segment[] | null;
	/** in a shadow run, what stands for a child written out as its bytes inside a regenerated
	 *  block; the bytes themselves otherwise */
	shadowChunk?: (node: Node, bytes: string) => string;
	/** whether a container's bytes around its children still hold for it as it is now; false writes it whole */
	frameHolds?: (node: Node, parsed: Node) => boolean;
	/** whether a changed child may be rendered on its own inside its container's frame; false
	 *  for one the container's handler renders together with its frame (an item's label) */
	spliceChild?: (parent: Node, index: number, was: Node | null) => boolean;
	/** what goes before every line but the first of a child written afresh inside its container's
	 *  frame, told from the bytes the child had (`text`) and what stood on its first line before
	 *  it (`head`: a list marker, a quote prefix, indentation); null or '' for nothing. Dialects
	 *  whose blocks continue by indentation or a line prefix provide it */
	continuation?: (parent: Node, text: string, head: string) => string | null;
	/** what separates two children of `parent` when the file shows no gap to copy (a container that
	 *  had one child): null for a blank line prefixed with `prefix`, the dialect's own otherwise (a
	 *  \par between the paragraphs of a LaTeX table cell) */
	childGap?: (parent: Node, prefix: string) => string | null;
	/** the bytes a text leaf is written as, on its own, its marks left to the wrappers around
	 *  it: the dialect's escaping for prose, the text itself inside a formula or a chip. Null
	 *  when the leaf cannot be written on its own. `atStart` says the bytes begin the block's
	 *  content, where a dialect's line-start markup binds */
	leafBytes?: (leaf: Node, parent: Node, atStart: boolean, block: Node, ctx?: Ctx) => string | null;
	/** inline `nodes` of a textblock, written as the dialect writes a run of inline content, with
	 *  no block-level decoration; null when they cannot be written on their own (a comment chip,
	 *  which owns its line) */
	inlineBytes?: (block: Node, nodes: Node[], atStart: boolean, ctx: Ctx) => string | null;
	/** the leaf runs of that text, positions relative to a block holding just those nodes; null
	 *  when they could not be told apart */
	mapInlineLeaves?: (block: Node, nodes: Node[], text: string, atStart: boolean, ctx: Ctx) => Segment[] | null;
	/** the fresh `bytes` as they must be written between the file's bytes before them (`head`) and
	 *  after them (`tail`), so no two of the three read as one (a LaTeX control word before a
	 *  letter takes a space); `bytes` is empty where the change only took bytes out, and the two
	 *  sides then meet; `gone` is what the change took out from between them, `parent` the node
	 *  they are written in. Null for a seam the dialect cannot write, which gives up the splice and
	 *  writes the block afresh */
	keepApart?: (bytes: string, tail: string, head: string, gone: string, parent: Node) => string | null;
	/** whether `text` ends on something that owns the rest of its line (a LaTeX comment), so
	 *  what follows it must begin a line of its own */
	endsLine?: (text: string) => boolean;
	/** whether the dialect writes `parent`'s child at `index` as more of the construct before it (a
	 *  LaTeX item joining the itemize above), so neither may be written as bytes that close or open it */
	continues?: (parent: Node, index: number) => boolean;
	/** whether the bytes the parse recorded for `parsed` read as that block wherever they are written:
	 *  not a LaTeX item's labelled first paragraph, whose bytes close the label's bracket */
	standsAlone?: (parsed: Node) => boolean;
};

/** how a dialect's own rendering of a container's children is joined */
export type PartsOptions = {
	/** join pristine neighbours on the bytes the file had between them, leaving '' for the parts
	 *  folded into the one before; off for a dialect that prefixes every part itself */
	join?: boolean;
	/** children whose part must stay the dialect's own, whatever the parse knows */
	keep?: (i: number) => boolean;
};

/**
 * Builds the doc-children serializer for one dialect. Each dialect gets its OWN memo cache: the
 * cache is keyed by node identity, and the same node object must never resolve to another
 * dialect's cached text.
 *
 * Assembly semantics: a block the parse still knows re-emits the bytes it came from; pristine
 * neighbours (consecutive in the parse) re-join on their original inter-block bytes; every
 * verbatim/regenerated boundary gets a hard blank line so paragraphs can't merge on re-parse,
 * unless the dialect's `boundary` hook decides otherwise. with no parse this equals plain
 * concatenation. also reproduces the body's leading/trailing gaps (they belong to no node) and
 * does the final trim, ONLY at edges that aren't verbatim-protected.
 */
export function createBlockAssembly(serializeNode: (node: Node, ctx: Ctx) => string, options: BlockAssemblyOptions = {}) {
	const leafSplice = createLeafSplice(options);
	const segmentSplice = createSegmentSplice(options);
	const { frameSplice, constructSplice } = createMemberSplice(serializeNode, options, leafSplice, segmentSplice);
	const { verbatimRun, verbatimParts } = createVerbatimParts(options, leafSplice, segmentSplice, frameSplice);
	return createDocAssembly(serializeNode, options, { leafSplice, segmentSplice, frameSplice, constructSplice, verbatimRun, verbatimParts });
}
