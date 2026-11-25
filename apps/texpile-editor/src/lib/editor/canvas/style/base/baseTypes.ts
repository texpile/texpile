import type { Node as PMNode } from 'prosemirror-model';

export type StyleLanguage = 'latex' | 'typst' | 'markdown';

/** what the base's looks depend on; a change needs a layout epoch (styleEpoch.ts) */
export type BaseSettings = {
	readonly language: StyleLanguage;
	readonly pageView: boolean;
	readonly readOnly: boolean;
	readonly viewportWidth: number;
	/** the editor text font setting, a font-family list */
	readonly editorFont: string | null;
};

/** the node an element draws and where it stands; the node view machinery answers it */
export type StyleNodeRef = {
	readonly node: PMNode;
	readonly getPos: () => number;
	/** the parent node, null for a top-level block; absent: read from the document at getPos */
	readonly parent?: PMNode | null;
};

export type StyleNodeSource = {
	nodeOf(el: import('../../tree/faceElement').FaceElement): StyleNodeRef | null;
	doc(): PMNode;
};

/** how a container's paragraphs space themselves; its schema spec's paragraphSpacing field, 'flow' without one */
export type ParagraphSpacing = 'flow' | 'body' | 'tight' | 'list' | 'cell' | 'abstract';

export const MARKDOWN_BREAKPOINT = 768;
