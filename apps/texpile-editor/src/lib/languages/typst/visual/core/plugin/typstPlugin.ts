// a Typst plugin: the functions it answers to, and what it draws, counts and edits for them
import type { Node } from 'prosemirror-model';
import type { Plugin } from 'prosemirror-state';
import type { EditorProps, EditorView, NodeView } from 'prosemirror-view';
import type { ChipFace, ChipFaceMaker } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import type { ChipSettings } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';
import type { TypstEntry } from '$lib/languages/typst/knowledge';
import type { MarkupDrawing } from '../parts/drawingFace';
import type { ImageDrawing } from '../reading/imageSize';
import type { TypstDocumentPlugin } from './typstDocumentPlugin';
import type { InsertItem } from '$lib/editor/visual/insert/insertItem';

export type TypstUse = {
	form: 'call' | 'set' | 'value';
	name: string;
	/** null for the paper's own name or one nothing defines; a set rule, and every name of a file with no scope yet,
	 *  is Typst's own */
	origin: 'std' | 'package' | null;
	entry: TypstEntry | null;
};

export type TypstDrawer = {
	draw: ChipFaceMaker;
	drawMarkup(markup: string): MarkupDrawing | null;
};

export type TypstFaceCore = TypstDrawer & {
	source: string;
	use: TypstUse;
	drawByName(source: string): ChipFace | null;
	drawImage(image: ImageDrawing): ChipFace;
};

export type TypstCountedCall = { name: string; args: readonly string[] };

export type TypstViewSetup = {
	docDir: () => string;
	parse(source: string): Node;
	layout(node: Node, view: EditorView, getPos: () => number | undefined): NodeView;
};

export type TypstNodeViews = NonNullable<EditorProps['nodeViews']>;

export type TypstEditorSlot = 'atStart' | 'afterTableEditing';

export type TypstPlugin = {
	functions?: readonly string[];
	role?(use: TypstUse): boolean;
	face?(core: TypstFaceCore): ChipFace | null;
	counts?: Record<string, (call: TypstCountedCall) => (number | null)[]>;
	settings?(source: string): ChipSettings | null;
	document?: TypstDocumentPlugin;
	views?(setup: TypstViewSetup): TypstNodeViews;
	editorPlugins?: Partial<Record<TypstEditorSlot, () => Plugin[]>>;
	insert?(): InsertItem[];
};
