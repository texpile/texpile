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

export type LatexImportCore = {
	inline(s: Stretch, ctx: ConversionContext): PmNode[];
	blocks(s: Stretch, lead?: { nodes: PmNode[]; span: Span }): PmNode[];
	node(type: string, attrs?: Record<string, unknown> | null, content?: ReadonlyArray<PmNode | null | undefined> | null): PmNode;
	text(text: string, marks?: PmMark[] | null, spans?: LeafSpan[] | null): PmNode | null;
	texts(text: string, marks?: PmMark[] | null, spans?: LeafSpan[] | null): PmNode[];
	collapse(nodes: PmNode[]): PmNode[];
	chip(span: Span, ctx?: ConversionContext, text?: string): PmNode;
	raw(span: Span, text?: string): PmNode;
	readCall(cursor: PieceCursor, piece: Piece): ImportCall;
	environment(node: SyntaxNode): TreeEnvironment;
	unitsIn(s: Stretch): Unit[];
	unitsInline(units: Unit[], ctx: ConversionContext): PmNode[];
	containsTabular(s: Stretch): boolean;
	isBlankStretch(s: Stretch): boolean;
	holdsNonMath(node: SyntaxNode): boolean;
	styleArgument(call: ImportCall, ctx: ConversionContext): { rest: Stretch; ctx: ConversionContext } | null;
};

export type LatexCommandImport = (im: TreeImport, call: ImportCall, ctx: ConversionContext) => PmNode[] | null;
export type LatexEnvironmentImport = (im: TreeImport, env: TreeEnvironment, ctx: ConversionContext) => PmNode[] | null;

export type LatexSchemaSpec = Pick<Schema['spec'], 'nodes' | 'marks'>;

export type LatexSaveCore = {
	children(node: Node, inTableCell: boolean): string;
	node(node: Node, ctx: Ctx): string;
	body(node: Node): string;
	verbatimParts(parent: Node, parts: string[], opts?: PartsOptions): string[];
	itemLabel(item: Node): { latex: string; bare: Node; body: Node; glued: boolean } | null;
};

export type LatexNodeSave = (node: Node, ctx: Ctx, core: LatexSaveCore) => string;
export type LatexMarkSave = (attrs: Record<string, unknown>, inner: string) => { open: string; close: string; inner?: string };

export type LatexDocumentPlugin = {
	import?: {
		commands?: Readonly<Record<string, LatexCommandImport>>;
		environments?: Readonly<Record<string, LatexEnvironmentImport>>;
		verbatimEnvironments?: Readonly<Record<string, LatexEnvironmentImport>>;
		environmentBody?: { reads(name: string): boolean; blocks(im: TreeImport, name: string, body: Stretch): PmNode[] };
		roles?: { math?: LatexEnvironmentImport; items?: LatexEnvironmentImport };
		blocks?(name: string, im: TreeImport): boolean;
		reads?(name: string): boolean;
	};
	schema?(spec: LatexSchemaSpec): LatexSchemaSpec;
	save?: {
		nodes?: Readonly<Record<string, LatexNodeSave>>;
		marks?: Readonly<Record<string, LatexMarkSave>>;
		frameHolds?(node: Node, parsed: Node): boolean;
		endsParagraph?: readonly string[];
	};
};
