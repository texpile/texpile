import type { DecorationSet, EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorState, StateField } from 'prosemirror-state';

export type ImagePluginState = DecorationSet;

export type InsertImagePlaceholder = {
	type: 'add';
	pos: number;
	id: unknown;
};

export type RemoveImagePlaceholder = {
	type: 'remove';
	id: unknown;
};

export type ImagePluginAction = InsertImagePlaceholder | RemoveImagePlaceholder;

export type ImagePlaceholderObject = { src?: string; className?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ImagePluginSettings<T = any> = {
	downloadImage?: (url: string) => Promise<string>;
	/** what downloadImage gave for this url last time, without waiting */
	knownImage?: (url: string) => string | null;
	downloadPlaceholder?: (url: string, view: EditorView) => string | ImagePlaceholderObject;
	uploadFile: (file: File) => Promise<string>;
	deleteSrc: (src: string) => Promise<void>;
	hasTitle: boolean;
	extraAttributes: Record<string, string | null>;
	createOverlay: (node: PMNode, getPos: () => number | undefined, view: EditorView) => Node | undefined;
	updateOverlay: (overlayRoot: Node, getPos: () => number | undefined, view: EditorView, node: PMNode) => void;
	defaultTitle: string;
	defaultAlt: string;
	enableResize: boolean;
	isBlock: boolean;
	resizeCallback: (el: Element, updateCallback: () => void) => () => void;
	imageMargin: number;
	minSize: number;
	maxSize: number;
	scaleImage: boolean;
	createState: (pluginSettings: ImagePluginSettings) => StateField<T>;
	createDecorations: (state: EditorState) => DecorationSet;
	findPlaceholder: (state: EditorState, id: object) => number | undefined;
};

export enum ResizeDirection {
	TOP = 'top',
	TOP_RIGHT = 'topRight',
	RIGHT = 'right',
	BOTTOM_RIGHT = 'bottomRight',
	BOTTOM = 'bottom',
	BOTTOM_LEFT = 'bottomLeft',
	LEFT = 'left',
	TOP_LEFT = 'topLeft'
}

export enum ImagePluginClassName {
	IMAGE_RESIZE_BOX_WRAPPER = 'imageResizeBoxWrapper',
	IMAGE_RESIZE_BOX_CENTER = 'imageResizeBoxCenter',
	IMAGE_RESIZE_BOX = 'imageResizeBox',
	IMAGE_RESIZE_BOX_CONTROL = 'imageResizeBoxControl',
	IMAGE_PLUGIN_ROOT = 'imagePluginRoot',
	IMAGE_PLUGIN_IMG = 'imagePluginImg'
}
