// what a LaTeX plugin says of the document: how the import reads its names, its schema nodes and how they are saved
import type { SyntaxNode } from '@lezer/common';
import type { Node, Schema } from 'prosemirror-model';
import type { ConversionContext, PmMark, PmNode } from '$lib/languages/latex/parser/builders';
import type { Span, TreeImport } from '$lib/languages/latex/parser/tree/importCore/treeImport';
import type { ImportCall } from '$lib/languages/latex/parser/tree/convert/treeCalls';
import type { Piece, PieceCursor } from '$lib/languages/latex/parser/tree/walk/pieceCursor';
import type { Stretch } from '$lib/languages/latex/parser/tree/walk/stretch';
import type { TreeEnvironment } from '$lib/languages/latex/parser/tree/walk/treeEnvironment';
import type { Unit } from '$lib/languages/latex/parser/tree/walk/units';
import type { LeafSpan } from '$lib/editor/visual/sourceSpans';
import type { Ctx } from '$lib/serializer/types';
import type { PartsOptions } from '$lib/serializer/blockAssembly';

/** the walk and the node builders, handed to an import with the import it runs in */
export type LatexImportCore = {
	inline(s: Stretch, ctx: ConversionContext): PmNode[];
	blocks(s: Stretch, lead?: { nodes: PmNode[]; span: Span }): PmNode[];
	node(type: string, attrs?: Record<string, unknown> | null, content?: ReadonlyArray<PmNode | null | undefined> | null): PmNode;
	text(text: string, marks?: PmMark[] | null, spans?: LeafSpan[] | null): PmNode | null;
	texts(text: string, marks?: PmMark[] | null, spans?: LeafSpan[] | null): PmNode[];
	collapse(nodes: PmNode[]): PmNode[];
	/** the bytes of `span` as a chip, wearing the context's marks */
	chip(span: Span, ctx?: ConversionContext, text?: string): PmNode;
	raw(span: Span, text?: string): PmNode;
	readCall(cursor: PieceCursor, piece: Piece): ImportCall;
	environment(node: SyntaxNode): TreeEnvironment;
	unitsIn(s: Stretch): Unit[];
	unitsInline(units: Unit[], ctx: ConversionContext): PmNode[];
	containsTabular(s: Stretch): boolean;
	isBlankStretch(s: Stretch): boolean;
	/** a display holding an environment whose body is not math (a tikzcd or a tabular), which no formula field draws */
	holdsNonMath(node: SyntaxNode): boolean;
	/** \textsc{...}: its argument and the context it reads in */
	styleArgument(call: ImportCall, ctx: ConversionContext): { rest: Stretch; ctx: ConversionContext } | null;
};

export type LatexCommandImport = (im: TreeImport, call: ImportCall, ctx: ConversionContext) => PmNode[] | null;
export type LatexEnvironmentImport = (im: TreeImport, env: TreeEnvironment, ctx: ConversionContext) => PmNode[] | null;

export type LatexSchemaSpec = Pick<Schema['spec'], 'nodes' | 'marks'>;

/** the save walk, handed to a node's save */
export type LatexSaveCore = {
	/** a node's children, threading sibling and table context */
	children(node: Node, inTableCell: boolean): string;
	node(node: Node, ctx: Ctx): string;
	/** the children as an environment's body, ending its last line */
	body(node: Node): string;
	/** a container's children, each one the parse still knows written as its bytes */
	verbatimParts(parent: Node, parts: string[], opts?: PartsOptions): string[];
	/** the label at the head of an item, and the paragraph with it taken out */
	itemLabel(item: Node): { latex: string; bare: Node; body: Node; glued: boolean } | null;
};

export type LatexNodeSave = (node: Node, ctx: Ctx, core: LatexSaveCore) => string;
/** what a mark writes around the run it holds; `inner` stands for the run (a bare \url is its run) */
export type LatexMarkSave = (attrs: Record<string, unknown>, inner: string) => { open: string; close: string; inner?: string };

export type LatexDocumentPlugin = {
	import?: {
		commands?: Readonly<Record<string, LatexCommandImport>>;
		environments?: Readonly<Record<string, LatexEnvironmentImport>>;
		/** environments whose body TeX reads as written */
		verbatimEnvironments?: Readonly<Record<string, LatexEnvironmentImport>>;
		/** the body of an environment the core keeps as an environment, for the names it reads */
		environmentBody?: { reads(name: string): boolean; blocks(im: TreeImport, name: string, body: Stretch): PmNode[] };
		/** an environment the package data says holds math, or takes items */
		roles?: { math?: LatexEnvironmentImport; items?: LatexEnvironmentImport };
		/** a command that stands as a block of its own; one mid-paragraph splits the paragraph */
		blocks?(name: string, im: TreeImport): boolean;
		/** commands it reads itself inside its own environments, which no signature needs to give arguments */
		reads?(name: string): boolean;
	};
	/** its nodes and marks, and the shared nodes it widens; run in list order, so the order is ProseMirror's */
	schema?(spec: LatexSchemaSpec): LatexSchemaSpec;
	save?: {
		nodes?: Readonly<Record<string, LatexNodeSave>>;
		marks?: Readonly<Record<string, LatexMarkSave>>;
		/** whether the bytes the parse kept around a node's children still say what the node says */
		frameHolds?(node: Node, parsed: Node): boolean;
		/** node types that end the paragraph before them: no \par of its own before one */
		endsParagraph?: readonly string[];
	};
};
