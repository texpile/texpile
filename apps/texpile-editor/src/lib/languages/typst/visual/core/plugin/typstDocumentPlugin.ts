// what a Typst plugin says of the document: how the import reads its calls and markup, its schema nodes and how they are saved
import type { SyntaxNode } from '@lezer/common';
import type { Mark, Node, Schema } from 'prosemirror-model';
import type { LeafSpan } from '$lib/editor/visual/sourceSpans';
import type { Ctx } from '$lib/serializer/types';
import type { PmMark, PmNode } from '../../convert/builders';
import type { Seg } from '../../convert/converter';
import type { GapKind } from '../../convert/reading/blockEnds';
import type { EnvBodyRender } from '../../serialize/envSerializer';

/** the walk and the node builders, handed to an import with the source it reads */
export type TypstImportCore = {
	node(type: string, attrs?: Record<string, unknown> | null, content?: ReadonlyArray<PmNode | null | undefined> | null): PmNode;
	text(text: string, marks?: PmMark[] | null, spans?: LeafSpan[] | null): PmNode | null;
	texts(text: string, marks?: PmMark[] | null, spans?: LeafSpan[] | null): PmNode[];
	collapse(nodes: PmNode[]): PmNode[];
	withMarks(node: PmNode, marks: PmMark[]): PmNode;
	/** a run of inline syntax as inline content */
	inline(nodes: SyntaxNode[], src: string, marks: PmMark[]): PmNode[];
	/** markup's children as the blocks they stand for */
	markup(kids: SyntaxNode[], src: string): Seg[];
	/** nested segments' blocks, each segment's first block carrying its bytes */
	noted(segs: Seg[]): PmNode[];
	ensureBlocks(blocks: PmNode[]): PmNode[];
	withGap(node: PmNode, gap: GapKind): PmNode;
	/** source as an inline chip wearing the marks, `from` where it starts in the source */
	chip(text: string, marks: PmMark[], from?: number): PmNode[];
	raw(text: string, from?: number): PmNode;
	/** a string argument's text */
	string(str: SyntaxNode, src: string): PmNode[];
	/** a call that is an inline element (a styled run, a line break), null for other code */
	element(hash: SyntaxNode, call: SyntaxNode, src: string, marks: PmMark[]): PmNode[] | null;
	/** a body written as code: the node it is, or a raw block */
	codeBody(arg: SyntaxNode, src: string): PmNode;
	/** what a content block holds as blocks, and the whitespace inside its brackets; null when something else stands there */
	contentBody(body: SyntaxNode, src: string): { blocks: PmNode[]; bodyLead: string; bodyTrail: string } | null;
};

export type TypstImport = { src: string; core: TypstImportCore };

/** a call (`kids[i]` its `#`) or markup standing as blocks; `next` is where the walk goes on */
export type TypstBlockImport = (im: TypstImport, kids: SyntaxNode[], i: number) => { seg: Seg; next: number } | null;
/** a call among inline content, `hash` where its bytes start */
export type TypstCallImport = (im: TypstImport, hash: SyntaxNode, call: SyntaxNode, marks: PmMark[]) => PmNode[] | null;
/** markup among inline content, `nodes[i]`; `next` is where the walk goes on */
export type TypstMarkupImport = (
	im: TypstImport,
	nodes: SyntaxNode[],
	i: number,
	marks: PmMark[]
) => { nodes: PmNode[]; next: number } | null;
/** a call or markup written as code (a figure's body, a grid's cell) */
export type TypstCodeImport = (im: TypstImport, node: SyntaxNode) => PmNode | null;

export type TypstSchemaSpec = Pick<Schema['spec'], 'nodes' | 'marks'>;

/** the save walk, handed to a node's save */
export type TypstSaveCore = {
	/** a container's children from `from` on, joined on their gaps */
	blocks(parent: Node, from?: number): string;
	/** how a body's blocks are written: each as its save writes it, joined on the gaps between them */
	body: EnvBodyRender;
	/** inline content as one run */
	inline(parent: Node, startOfLine?: boolean, extra?: string, singleLine?: boolean): string;
	/** inline content on one line followed by `after`; null where something in it ends the line */
	line(parent: Node, after: string): string | null;
	/** inline content inside brackets or quotes */
	bracketed(parent: Node): string;
	/** the block's <label>, set off as the source set it */
	label(node: Node): string;
	/** what the file put before the line of a block a container holds */
	fileIndent(node: Node, ctx: Ctx): string;
};

export type TypstNodeSave = (node: Node, ctx: Ctx, core: TypstSaveCore) => string;

/** what an inline node, or a text leaf a mark writes itself, puts in its paragraph's run */
export type TypstRun = {
	content: string;
	marks: Mark[];
	/** 'text' is plain prose (escaped, whitespace expelling applies); 'comment' a `//` chip that owns the rest of its line;
	 *  'ref' an @target atom */
	kind: 'text' | 'comment' | 'ref' | 'break' | 'other';
	/** a url written in prose, told from the node: in a shadow run its content is no url */
	url?: boolean;
	/** what follows it opens a line */
	startsLine?: boolean;
};

export type TypstRunCore = {
	/** the text as the shadow run reads it */
	shadowed(node: Node, text: string): string;
	/** the marks in the order they nest */
	marks(marks: readonly Mark[]): Mark[];
	singleLine: boolean;
};

/** what a mark writes around the run it holds; `inWord` is its form inside a word */
export type TypstMarkWrap = { open: string; close: string; expel?: boolean; inWord?: { open: string; close: string } };

export type TypstDocumentPlugin = {
	import?: {
		/** calls by the name they are written with (`figure`, `table.cell`): standing as a block, in a paragraph, as code */
		calls?: {
			blocks?: Readonly<Record<string, TypstBlockImport>>;
			/** in a paragraph only, before any inline element */
			inline?: Readonly<Record<string, TypstCallImport>>;
			/** an inline element, in a paragraph and as code */
			elements?: Readonly<Record<string, TypstCallImport>>;
			code?: Readonly<Record<string, TypstCodeImport>>;
		};
		/** markup by its syntax kind (`Heading`, `ListItem`, `Strong`) */
		markup?: {
			blocks?: Readonly<Record<string, TypstBlockImport>>;
			inline?: Readonly<Record<string, TypstMarkupImport>>;
			code?: Readonly<Record<string, TypstCodeImport>>;
		};
		/** a call of any name the plugin reads by what the data says of it, asked after the names */
		roles?: { blocks?: TypstBlockImport; elements?: TypstCallImport };
		/** source the editor draws, which the converter keeps a chip of its own */
		chips?(source: string): boolean;
	};
	/** its nodes and marks, and the shared nodes it widens; run in list order, so the order is ProseMirror's */
	schema?(spec: TypstSchemaSpec): TypstSchemaSpec;
	save?: {
		nodes?: Readonly<Record<string, TypstNodeSave>>;
		/** inline nodes, as runs of their paragraph; null writes nothing */
		inline?: Readonly<Record<string, (node: Node, run: TypstRunCore) => TypstRun | null>>;
		/** a text leaf one of its marks writes itself (inline raw, a url in prose); null passes it on */
		text?(node: Node, run: TypstRunCore): TypstRun | null;
		/** its marks, nesting in list order, the first outermost */
		marks?: Readonly<Record<string, (attrs: Record<string, unknown>) => TypstMarkWrap>>;
		/** a text leaf's bytes on their own when a mark it wears decides them; undefined passes it on, null writes the block afresh */
		leaf?(leaf: Node, text: string): string | null | undefined;
		/** a node written as one run, its bytes from its attrs */
		wholeRun?(node: Node): boolean;
		/** a block bound to whole lines: it opens with a line-start token and its last line ends it */
		ownLines?(node: Node, core: TypstSaveCore): boolean;
		/** blocks that are one only while nothing follows them in their paragraph */
		alone?: readonly string[];
		/** two blocks a single line end joins (a tight list's items) */
		tight?(prev: Node, next: Node, nested: boolean): boolean;
		/** an inline node that leaves its paragraph blank */
		blank?(node: Node): boolean;
		/** whether the bytes the parse kept around a node's children still say what the node says */
		frameHolds?(node: Node, parsed: Node): boolean;
		/** children of a body written as code that are written inside the call still (a figure's caption) */
		inCall?: readonly string[];
		/** a block whose text the file wrote as a string, written whole */
		stringBody?(node: Node): boolean;
		/** textblocks whose inline content is one run a change is spliced into, and the characters that are structure in it */
		runs?: Readonly<Record<string, { write(run: Node, core: TypstSaveCore): string; structure: string }>>;
	};
};
