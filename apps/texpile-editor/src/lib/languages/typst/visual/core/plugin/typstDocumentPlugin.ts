// what a Typst plugin says of the document: how the import reads its calls and markup, its schema nodes and how they are saved
import type { SyntaxNode } from '@lezer/common';
import type { Mark, Node, Schema } from 'prosemirror-model';
import type { LeafSpan } from '$lib/editor/visual/sourceSpans';
import type { Ctx } from '$lib/serializer/types';
import type { PmMark, PmNode } from '../../convert/builders';
import type { Seg } from '../../convert/converter';
import type { GapKind } from '../../convert/reading/blockEnds';
import type { EnvBodyRender } from '../../serialize/envSerializer';

export type TypstImportCore = {
	node(type: string, attrs?: Record<string, unknown> | null, content?: ReadonlyArray<PmNode | null | undefined> | null): PmNode;
	text(text: string, marks?: PmMark[] | null, spans?: LeafSpan[] | null): PmNode | null;
	texts(text: string, marks?: PmMark[] | null, spans?: LeafSpan[] | null): PmNode[];
	collapse(nodes: PmNode[]): PmNode[];
	withMarks(node: PmNode, marks: PmMark[]): PmNode;
	inline(nodes: SyntaxNode[], src: string, marks: PmMark[]): PmNode[];
	markup(kids: SyntaxNode[], src: string): Seg[];
	noted(segs: Seg[]): PmNode[];
	ensureBlocks(blocks: PmNode[]): PmNode[];
	withGap(node: PmNode, gap: GapKind): PmNode;
	chip(text: string, marks: PmMark[], from?: number): PmNode[];
	raw(text: string, from?: number): PmNode;
	string(str: SyntaxNode, src: string): PmNode[];
	element(hash: SyntaxNode, call: SyntaxNode, src: string, marks: PmMark[]): PmNode[] | null;
	codeBody(arg: SyntaxNode, src: string): PmNode;
	contentBody(body: SyntaxNode, src: string): { blocks: PmNode[]; bodyLead: string; bodyTrail: string } | null;
};

export type TypstImport = { src: string; core: TypstImportCore };

export type TypstBlockImport = (im: TypstImport, kids: SyntaxNode[], i: number) => { seg: Seg; next: number } | null;
export type TypstCallImport = (im: TypstImport, hash: SyntaxNode, call: SyntaxNode, marks: PmMark[]) => PmNode[] | null;
export type TypstMarkupImport = (
	im: TypstImport,
	nodes: SyntaxNode[],
	i: number,
	marks: PmMark[]
) => { nodes: PmNode[]; next: number } | null;
export type TypstCodeImport = (im: TypstImport, node: SyntaxNode) => PmNode | null;

export type TypstSchemaSpec = Pick<Schema['spec'], 'nodes' | 'marks'>;

export type TypstSaveCore = {
	blocks(parent: Node, from?: number): string;
	body: EnvBodyRender;
	inline(parent: Node, startOfLine?: boolean, extra?: string, singleLine?: boolean): string;
	line(parent: Node, after: string): string | null;
	bracketed(parent: Node): string;
	label(node: Node): string;
	fileIndent(node: Node, ctx: Ctx): string;
};

export type TypstNodeSave = (node: Node, ctx: Ctx, core: TypstSaveCore) => string;

export type TypstRun = {
	content: string;
	marks: Mark[];
	/** 'text' is plain prose (escaped, whitespace expelling applies); 'comment' a `//` chip that owns the rest of its line;
	 *  'ref' an @target atom */
	kind: 'text' | 'comment' | 'ref' | 'break' | 'other';
	url?: boolean;
	startsLine?: boolean;
};

export type TypstRunCore = {
	shadowed(node: Node, text: string): string;
	marks(marks: readonly Mark[]): Mark[];
	singleLine: boolean;
};

export type TypstMarkWrap = { open: string; close: string; expel?: boolean; inWord?: { open: string; close: string } };

export type TypstDocumentPlugin = {
	import?: {
		calls?: {
			blocks?: Readonly<Record<string, TypstBlockImport>>;
			inline?: Readonly<Record<string, TypstCallImport>>;
			elements?: Readonly<Record<string, TypstCallImport>>;
			code?: Readonly<Record<string, TypstCodeImport>>;
		};
		markup?: {
			blocks?: Readonly<Record<string, TypstBlockImport>>;
			inline?: Readonly<Record<string, TypstMarkupImport>>;
			code?: Readonly<Record<string, TypstCodeImport>>;
		};
		roles?: { blocks?: TypstBlockImport; elements?: TypstCallImport };
		chips?(source: string): boolean;
	};
	schema?(spec: TypstSchemaSpec): TypstSchemaSpec;
	save?: {
		nodes?: Readonly<Record<string, TypstNodeSave>>;
		inline?: Readonly<Record<string, (node: Node, run: TypstRunCore) => TypstRun | null>>;
		text?(node: Node, run: TypstRunCore): TypstRun | null;
		marks?: Readonly<Record<string, (attrs: Record<string, unknown>) => TypstMarkWrap>>;
		leaf?(leaf: Node, text: string): string | null | undefined;
		wholeRun?(node: Node): boolean;
		ownLines?(node: Node, core: TypstSaveCore): boolean;
		alone?: readonly string[];
		tight?(prev: Node, next: Node, nested: boolean): boolean;
		blank?(node: Node): boolean;
		frameHolds?(node: Node, parsed: Node): boolean;
		inCall?: readonly string[];
		stringBody?(node: Node): boolean;
		runs?: Readonly<Record<string, { write(run: Node, core: TypstSaveCore): string; structure: string }>>;
	};
};
