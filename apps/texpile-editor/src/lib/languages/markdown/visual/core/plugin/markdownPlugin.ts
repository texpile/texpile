import type { SyntaxNode } from '@lezer/common';
import type { Mark, Node, Schema } from 'prosemirror-model';
import type { Ctx } from '$lib/serializer/types';
import type { PmMark, PmNode } from '../../builders';
import type { LineState, Reader } from '../../convert/reader';

export type MarkdownBlockImport = (r: Reader, node: SyntaxNode) => PmNode[];

export type MarkdownInlineImport = (
	r: Reader,
	node: SyntaxNode,
	marks: PmMark[],
	st: LineState,
	to: number
) => PmNode[] | { nodes: PmNode[]; next: number } | null;

export type MarkdownParagraphImport = (r: Reader, node: SyntaxNode) => PmNode[] | null;

export type MarkdownSchemaSpec = Pick<Schema['spec'], 'nodes' | 'marks'>;

export type MarkdownInlineOptions = {
	startOfLine?: boolean;
	inTableCell?: boolean;
	singleLine?: boolean;
};

export type MarkdownSaveCore = {
	blocks(parent: Node, inTableCell?: boolean): string;
	inline(parent: Node, options?: MarkdownInlineOptions): string;
	node(node: Node, ctx: Ctx): string;
	interrupts(next: Node): boolean;
};

export type MarkdownNodeSave = (node: Node, ctx: Ctx, core: MarkdownSaveCore) => string;

export type MarkdownRun = {
	content: string;
	marks: Mark[];
	isText: boolean;
	startsLine?: boolean;
};

export type MarkdownRunCore = {
	shadowed(node: Node, text: string): string;
	marks(marks: readonly Mark[]): Mark[];
	inTableCell: boolean;
	singleLine: boolean;
};

export type MarkdownAround = { before: string; after: string };

export type MarkdownMarkWrap = { open: string; close: string; expel?: boolean };

export type MarkdownPlugin = {
	import?: {
		blocks?: Readonly<Record<string, MarkdownBlockImport>>;
		inline?: Readonly<Record<string, MarkdownInlineImport>>;
		paragraph?: MarkdownParagraphImport;
	};
	schema?(spec: MarkdownSchemaSpec): MarkdownSchemaSpec;
	save?: {
		nodes?: Readonly<Record<string, MarkdownNodeSave>>;
		inline?: Readonly<Record<string, (node: Node, core: MarkdownRunCore) => MarkdownRun | null>>;
		text?(node: Node, core: MarkdownRunCore, around: MarkdownAround): MarkdownRun | null;
		marks?: Readonly<Record<string, (mark: Mark, inTableCell: boolean) => MarkdownMarkWrap>>;
		wholeRun?(node: Node): boolean;
		interrupts?(node: Node): boolean;
		spliceChild?(parent: Node, index: number): boolean;
		/** two top-level neighbors written on consecutive lines, with no blank line between */
		tight?(prev: Node, next: Node): boolean;
	};
};
