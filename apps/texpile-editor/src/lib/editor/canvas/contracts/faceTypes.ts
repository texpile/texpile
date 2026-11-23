import type { Component } from 'svelte';
import type { Fragment as PMFragment, Node as PMNode } from 'prosemirror-model';
import type { Decoration, DecorationSource } from 'prosemirror-view';
import type { Crop } from '$lib/images/crop/cropGeometry';
import type { FaceElement, faceElement } from '../tree/faceElement';
import type { CanvasHit, CursorKind } from './geometryTypes';
import type { FaceInputKey } from './invalidationTypes';
import type { DocRect } from './layoutTypes';
import type { ComputedStyle, PaintStyle, Rgba, ThemeToken } from './styleTypes';
import type { EditorLanguage, VisualView } from './viewTypes';

export type FaceEventType = 'press' | 'click' | 'dblclick' | 'contextmenu' | 'hoverstart' | 'hoverend' | 'dragstart';

/** a real mouse event whose target is the hit FaceElement (2.3); preventDefault and stopPropagation reach the real event */
export type CanvasPointerEvent = Omit<MouseEvent, 'target'> & { readonly target: FaceElement };

/** a face handler that captured the pointer (resize handles, column edges) gets the moves until release */
export type FaceDrag = {
	move(event: MouseEvent, hit: CanvasHit | null): void;
	release(event: MouseEvent, hit: CanvasHit | null): void;
	readonly cursor?: CursorKind;
};

export type FaceEventContext = {
	readonly view: VisualView;
	readonly hit: CanvasHit;
	/** the element the handler sits on */
	readonly element: FaceElement;
	/** the position before the node the face draws */
	pos(): number;
	capture(drag: FaceDrag): void;
};

/** true: handled, ProseMirror skips the event */
export type FaceHandler = (event: CanvasPointerEvent, ctx: FaceEventContext) => boolean | void;

export type ReplacedHit = { readonly part: string; readonly rect: DocRect | null };

/** a theme token's color in the app's mode */
export type ThemeTokenColor = (name: ThemeToken) => Rgba;

/** drawn content CSS does not describe: a bitmap, a formula, an icon, a checkbox */
export type ReplacedContent = {
	/** natural size in CSS px at the element's font size; null while unknown (a bitmap decoding) */
	intrinsic(style: ComputedStyle): { width: number; height: number; baseline?: number } | null;
	/** draws into the content box; the painter has applied transform, clip and opacity */
	paint(ctx: CanvasRenderingContext2D, box: DocRect, style: PaintStyle, token: ThemeTokenColor): void;
	keys?: readonly FaceInputKey[];
	/** a hit inside the content (a formula's atoms), in content-box coordinates */
	hit?(x: number, y: number): ReplacedHit | null;
};

export type BitmapSource = { path: string; page?: number; crop?: Crop; turn?: 0 | 90 | 180 | 270; drawnWidthPx: number };
export type BitmapState = 'loading' | 'missing' | { bitmap: ImageBitmap; width: number; height: number };
export type BitmapCache = {
	/** starts a decode on a miss; known sizes answer synchronously */
	get(source: BitmapSource): BitmapState;
	sizeOf(path: string): { width: number; height: number } | null;
	onChange(listener: (path: string) => void): () => void;
};

export type MathSource = { syntax: 'latex' | 'typst'; source: string; display: boolean };

/** counters that cross top-level blocks, from the model (5.7) */
export type DocumentCounterName = 'figure' | 'table' | 'equation';
export type DocumentCounters = { at(pos: number, name: DocumentCounterName): number };

/** a name iconPaths.ts draws */
export type LucideIconName = string;

export type FaceSettings = {
	readonly justify: boolean;
	readonly hyphenate: boolean;
	readonly showCaptions: boolean;
	readonly imageDirectory: string;
	readonly cropFormat: string;
	readonly isMainFile: boolean;
};

/** the block handle's gear and the context menu's Settings item, by node type (12.2) */
export type BlockSettingsOffer = {
	/** a type some of whose nodes have no settings (a Typst call that is no layout) */
	offers?(node: PMNode): boolean;
	label(node: PMNode): string;
	open(pos: number, view: VisualView, gear?: DOMRect): void;
	/** the block holds one block alone and opens that block's settings with its own among them */
	forOnlyChild?(node: PMNode): boolean;
	/** a gear inside the block passes the body's settings up (PASSES_BODY_SETTINGS) */
	passesBodySettings?: boolean;
};

export type FaceQueryContext = {
	readonly view: VisualView;
	readonly language: EditorLanguage;
	readonly editable: boolean;
	readonly settings: FaceSettings;
};

export type FaceBuildContext = FaceQueryContext & {
	pos(): number;
	/** outer, as a node view's constructor got them */
	readonly decorations: readonly Decoration[];
	readonly inner: DecorationSource;
	readonly counters: DocumentCounters;
	el: typeof faceElement;
	/** reads an async or store input and relays this block when it changes (8.5) */
	read<T>(key: FaceInputKey, value: () => T): T;
	bitmap(source: BitmapSource): BitmapState;
	/** a replaced formula element (13.3) */
	math(source: MathSource): FaceElement;
	icon(name: LucideIconName, size: number): FaceElement;
	checkbox(checked: boolean): FaceElement;
	/** a PM fragment laid out as nested content (Typst drawTypstMarkup, gone suggestion blocks) */
	serializeFragment(fragment: PMFragment, inline: boolean): FaceElement;
	/** a box sized by a mounted overlay (the paper cropper, the no-caption banner) */
	overlaySlot(name: string): FaceElement;
};

export type FaceUiState = {
	selected: boolean;
	hovered: boolean;
	caretInside: boolean;
	focused: boolean;
	readOnly: boolean;
	visible: boolean;
};

/** one of a block's own actions, in the bar over the block while it is selected whole (Crop, Edit figure) */
export type BlockAction = {
	readonly key: string;
	readonly label: string;
	readonly icon: Component<{ class?: string }>;
	run(): void;
};

export type OverlaySpec = {
	key: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any overlay component, mounted with its own props
	component: Component<any>;
	props: Record<string, unknown>;
	/** a FaceElement.anchor of this node, or the node itself */
	anchor: { part?: string };
	placement: 'inFlow' | 'floating';
	when: 'always' | 'hovered' | 'selected' | 'caretInside' | 'hoveredOrCaretInside';
};
