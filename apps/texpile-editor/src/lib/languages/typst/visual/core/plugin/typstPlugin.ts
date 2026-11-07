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

/** the one name a chip uses: a call, a set rule of an element, or the name alone (`#etal`), its trailing label left out */
export type TypstUse = {
	form: 'call' | 'set' | 'value';
	/** as written: `footnote`, `figure.where`, `datetime.today().display` */
	name: string;
	/** null for the paper's own name or one nothing defines; a set rule, and every name of a file with no scope yet,
	 *  is Typst's own */
	origin: 'std' | 'package' | null;
	entry: TypstEntry | null;
};

/** how a face draws what a chip holds */
export type TypstDrawer = {
	draw: ChipFaceMaker;
	drawMarkup(markup: string): MarkupDrawing | null;
};

export type TypstFaceCore = TypstDrawer & {
	/** the chip's Typst, its code given its hash */
	source: string;
	use: TypstUse;
	/** draws Typst of its own by the plugins that list its name */
	drawByName(source: string): ChipFace | null;
	drawImage(image: ImageDrawing): ChipFace;
};

/** a call as counting reads it: its name and the syntax of what its argument list holds */
export type TypstCountedCall = { name: string; args: readonly string[] };

/** what a plugin's node views are made with */
export type TypstViewSetup = {
	docDir: () => string;
	/** the Typst as the editor reads it, for a view to check what an edit reads back as */
	parse(source: string): Node;
	/** the view the core draws a layout call with (`#align(..)[..]`, a grid) */
	layout(node: Node, view: EditorView, getPos: () => number | undefined): NodeView;
};

export type TypstNodeViews = NonNullable<EditorProps['nodeViews']>;

/** where a plugin's ProseMirror plugins go in the editor's stack, named for what they sit next to */
export type TypstEditorSlot = 'atStart' | 'afterTableEditing';

export type TypstPlugin = {
	/** Typst's own functions and modules it answers to; a module answers for its fields (`sym` for `#sym.arrow.r`) */
	functions?: readonly string[];
	/** a use it answers to by what the data says of the name; read once per name and file scope */
	role?(use: TypstUse): boolean;
	face?(core: TypstFaceCore): ChipFace | null;
	/** what a call adds to a counter by name: a number it prints, or null to take the counter's next */
	counts?: Record<string, (call: TypstCountedCall) => (number | null)[]>;
	/** the panel for a chip that is one call it answers to */
	settings?(source: string): ChipSettings | null;
	/** its import, schema and save, which the converter and serializer read from the document list */
	document?: TypstDocumentPlugin;
	/** the node views of its nodes */
	views?(setup: TypstViewSetup): TypstNodeViews;
	/** its ProseMirror plugins, by where they go in the editor's stack */
	editorPlugins?: Partial<Record<TypstEditorSlot, () => Plugin[]>>;
	/** what it offers to insert */
	insert?(): InsertItem[];
};
