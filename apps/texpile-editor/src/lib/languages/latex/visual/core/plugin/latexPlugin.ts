import type { SyntaxNode } from '@lezer/common';
import type { Plugin } from 'prosemirror-state';
import type { EditorProps } from 'prosemirror-view';
import type { ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import type { ChipSettings } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
import type { SourceUnit } from '$lib/languages/latex/parser/tree/walk/sourceUnits';
import type { Stretch } from '$lib/languages/latex/parser/tree/walk/stretch';
import type { TreeArg, TreeCall } from '$lib/languages/latex/parser/tree/walk/treeArgs';
import type { LatexDocumentPlugin } from './latexDocumentPlugin';
import type { LatexArguments, LatexInsertContext, LatexInsertOffer } from './latexInsert';

export type LatexPart =
	| { kind: 'command'; name: string; call: TreeCall }
	| { kind: 'verbatim'; name: string; source: string }
	| { kind: 'math'; name: string; node: SyntaxNode }
	| { kind: 'environment'; name: string; node: SyntaxNode }
	| { kind: 'whole'; name: string; source: string };

export type LatexFaceCore = {
	src: string;
	source: string;
	inTitle: boolean;
	text(arg: TreeArg | null | undefined): string;
	optional(call: TreeCall): string | null;
	draw(arg: TreeArg | undefined): ChipFace[] | null;
	drawRun(arg: TreeArg | undefined): ChipFace[] | null;
	drawArguments(args: TreeArg[]): ChipFace[] | null;
	unitsOf(s: Stretch): SourceUnit[];
	drawUnits(units: SourceUnit[]): ChipFace[] | null;
	drawSource(latex: string): ChipFace | null;
	nextFootnote(): number;
	definedByPaper(name: string): boolean;
};

export type UnitsDrawer = { unitsOf(s: Stretch): SourceUnit[]; draw(units: SourceUnit[]): ChipFace[] | null };

export type LatexCountedCall = { name: string; given: number | null };

export type LatexViewSetup = {
	imageDir: () => string;
	onJumpToLabel?: (name: string) => boolean;
	onJumpToDefinition?: (name: string) => boolean;
};

export type LatexNodeViews = NonNullable<EditorProps['nodeViews']>;

export type LatexEditorSlot = 'atStart' | 'beforeWordCount' | 'afterContents';

export type LatexFaceAnswer = ChipFace | ChipFace[] | null | undefined;

export type LatexPlugin = {
	commands?: readonly string[];
	environments?: readonly string[];
	role?: { commands?(name: string): boolean; environments?(name: string): boolean };
	kernel?: true;
	overDefinition?: true;
	opensChip?: boolean | ((name: string, kind: 'commands' | 'environments') => boolean);
	face?(part: LatexPart, core: LatexFaceCore): LatexFaceAnswer;
	counts?: Record<string, (call: LatexCountedCall) => (number | null)[]>;
	settings?(source: string): ChipSettings | null;
	document?: LatexDocumentPlugin;
	views?(setup: LatexViewSetup): LatexNodeViews;
	editorPlugins?: Partial<Record<LatexEditorSlot, () => Plugin[]>>;
	insert?(ctx: LatexInsertContext): LatexInsertOffer[];
	arguments?: LatexArguments;
};
