// a LaTeX plugin: the names it answers to, and what it draws, counts and edits for them
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

/**
 * what a plugin is asked to draw: a command, the Verb node of a verbatim one, math holding one command and nothing
 * else, an environment, or a chip that is one environment taken whole before any parse
 */
export type LatexPart =
	| { kind: 'command'; name: string; call: TreeCall }
	| { kind: 'verbatim'; name: string; source: string }
	| { kind: 'math'; name: string; node: SyntaxNode }
	| { kind: 'environment'; name: string; node: SyntaxNode }
	| { kind: 'whole'; name: string; source: string };

/** what the walk hands a face: the text the part stands in and the drawing of what it holds */
export type LatexFaceCore = {
	src: string;
	/** the part's own LaTeX */
	source: string;
	/** inside the text of a title block's command */
	inTitle: boolean;
	text(arg: TreeArg | null | undefined): string;
	/** the text of the call's first bracket, trimmed */
	optional(call: TreeCall): string | null;
	/** an argument as a group: a switch at its start styles the rest */
	draw(arg: TreeArg | undefined): ChipFace[] | null;
	/** an argument as a run of parts */
	drawRun(arg: TreeArg | undefined): ChipFace[] | null;
	/** the text of arguments, one after another */
	drawArguments(args: TreeArg[]): ChipFace[] | null;
	unitsOf(s: Stretch): SourceUnit[];
	drawUnits(units: SourceUnit[]): ChipFace[] | null;
	/** LaTeX of the paper's own, drawn as its definition */
	drawSource(latex: string): ChipFace | null;
	nextFootnote(): number;
	definedByPaper(name: string): boolean;
};

/** draws units of the text a part stands in */
export type UnitsDrawer = { unitsOf(s: Stretch): SourceUnit[]; draw(units: SourceUnit[]): ChipFace[] | null };

/** a call as counting reads it, with no signature read: its name and the number its first bracket gives */
export type LatexCountedCall = { name: string; given: number | null };

/** what a plugin's node views are made with */
export type LatexViewSetup = {
	imageDir: () => string;
	onJumpToLabel?: (name: string) => boolean;
	onJumpToDefinition?: (name: string) => boolean;
};

export type LatexNodeViews = NonNullable<EditorProps['nodeViews']>;

/** where a plugin's ProseMirror plugins go in the editor's stack, named for what they sit next to */
export type LatexEditorSlot = 'atStart' | 'beforeWordCount' | 'afterContents';

/** a face's answer: undefined passes the part on; null leaves the chip as its LaTeX, except for an environment, which
 *  the next plugin that answers to it is asked to draw */
export type LatexFaceAnswer = ChipFace | ChipFace[] | null | undefined;

export type LatexPlugin = {
	commands?: readonly string[];
	environments?: readonly string[];
	/** the names the package data gives a role this plugin answers to */
	role?: { commands?(name: string): boolean; environments?(name: string): boolean };
	/** answers for the kernel's reading of its names, after any plugin for a package's */
	kernel?: true;
	/** draws its names even where the paper defines them (LyX writes its own \lyxadded into every preamble) */
	overDefinition?: true;
	/** false leaves a chip that starts with the name as its LaTeX; inside another chip's text it still draws */
	opensChip?: boolean | ((name: string, kind: 'commands' | 'environments') => boolean);
	face?(part: LatexPart, core: LatexFaceCore): LatexFaceAnswer;
	/** what a call adds to a counter by name: a number it prints, or null to take the counter's next */
	counts?: Record<string, (call: LatexCountedCall) => (number | null)[]>;
	/** the panel for a chip that is one call it answers to */
	settings?(source: string): ChipSettings | null;
	/** its import, schema and save, which the parser's worker reads from the document list */
	document?: LatexDocumentPlugin;
	/** the node views of its nodes */
	views?(setup: LatexViewSetup): LatexNodeViews;
	/** its ProseMirror plugins, by where they go in the editor's stack */
	editorPlugins?: Partial<Record<LatexEditorSlot, () => Plugin[]>>;
	/** what it offers to insert from what the open file loads */
	insert?(ctx: LatexInsertContext): LatexInsertOffer[];
	/** the optional arguments a node of its own does not have yet */
	arguments?: LatexArguments;
};
