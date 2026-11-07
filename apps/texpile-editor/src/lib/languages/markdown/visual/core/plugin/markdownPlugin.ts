// what a Markdown plugin says of the document: how the import reads the tree's nodes, its schema nodes and marks, and how they are saved
import type { SyntaxNode } from '@lezer/common';
import type { Mark, Node, Schema } from 'prosemirror-model';
import type { Ctx } from '$lib/serializer/types';
import type { PmMark, PmNode } from '../../builders';
import type { LineState, Reader } from '../../convert/reader';

/** nodes read by name: a block, the nodes it becomes */
export type MarkdownBlockImport = (r: Reader, node: SyntaxNode) => PmNode[];

/** an inline node, the nodes it becomes and where the content goes on (past the node when left out); null passes it on to the next plugin that reads the name */
export type MarkdownInlineImport = (
	r: Reader,
	node: SyntaxNode,
	marks: PmMark[],
	st: LineState,
	to: number
) => PmNode[] | { nodes: PmNode[]; next: number } | null;

/** a paragraph that is a block of its own (a picture alone in it); null leaves it a paragraph */
export type MarkdownParagraphImport = (r: Reader, node: SyntaxNode) => PmNode[] | null;

export type MarkdownSchemaSpec = Pick<Schema['spec'], 'nodes' | 'marks'>;

/** how inline content is written: the options of one run */
export type MarkdownInlineOptions = {
	startOfLine?: boolean;
	inTableCell?: boolean;
	singleLine?: boolean;
};

/** the save walk, handed to a node's save */
export type MarkdownSaveCore = {
	/** a container's children written one after the other */
	blocks(parent: Node, inTableCell?: boolean): string;
	/** inline content as one run */
	inline(parent: Node, options?: MarkdownInlineOptions): string;
	/** one node as its save writes it */
	node(node: Node, ctx: Ctx): string;
	/** whether `next` may sit right under a paragraph line without joining it */
	interrupts(next: Node): boolean;
};

export type MarkdownNodeSave = (node: Node, ctx: Ctx, core: MarkdownSaveCore) => string;

/** what an inline node, or a text leaf a mark writes itself, puts in its paragraph's run */
export type MarkdownRun = {
	content: string;
	marks: Mark[];
	/** plain prose, which is escaped and whose edges emphasis leaves out */
	isText: boolean;
	/** what follows it opens a line */
	startsLine?: boolean;
};

export type MarkdownRunCore = {
	/** the text as the shadow run reads it */
	shadowed(node: Node, text: string): string;
	/** the marks the node wears that write something, in the order they nest */
	marks(marks: readonly Mark[]): Mark[];
	inTableCell: boolean;
	singleLine: boolean;
};

/** the characters beside a text leaf in its paragraph: '' at the edge, a line feed beside a break */
export type MarkdownAround = { before: string; after: string };

/** what a mark writes around the run it holds; `expel` keeps the spaces and punctuation at its edges outside it */
export type MarkdownMarkWrap = { open: string; close: string; expel?: boolean };

export type MarkdownPlugin = {
	import?: {
		/** tree nodes by name, the first block of a name that more than one plugin reads wins */
		blocks?: Readonly<Record<string, MarkdownBlockImport>>;
		/** a name several plugins read is asked of each in list order */
		inline?: Readonly<Record<string, MarkdownInlineImport>>;
		paragraph?: MarkdownParagraphImport;
	};
	/** its nodes and marks, and the shared nodes it widens; run in list order */
	schema?(spec: MarkdownSchemaSpec): MarkdownSchemaSpec;
	save?: {
		nodes?: Readonly<Record<string, MarkdownNodeSave>>;
		/** inline nodes as runs of their paragraph; null writes nothing */
		inline?: Readonly<Record<string, (node: Node, core: MarkdownRunCore) => MarkdownRun | null>>;
		/** a text leaf one of its marks writes itself; null passes it on */
		text?(node: Node, core: MarkdownRunCore, around: MarkdownAround): MarkdownRun | null;
		/** its marks, nesting in list order, the first outermost */
		marks?: Readonly<Record<string, (mark: Mark, inTableCell: boolean) => MarkdownMarkWrap>>;
		/** a node written as one run, its bytes from its attrs */
		wholeRun?(node: Node): boolean;
		/** a block that may sit right under a paragraph line without joining it */
		interrupts?(node: Node): boolean;
		/** whether a changed child may be written on its own inside its container's frame */
		spliceChild?(parent: Node, index: number): boolean;
	};
};
