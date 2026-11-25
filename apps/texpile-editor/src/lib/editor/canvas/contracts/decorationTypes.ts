import type { Fragment as PMFragment, Mark } from 'prosemirror-model';
import type { FaceElement } from '../tree/faceElement';
import type { FaceBuildContext } from './faceTypes';
import type { LineBox } from './layoutTypes';
import type { RunStyle } from './styleTypes';

export type InlineDecorationView = {
	from: number;
	to: number;
	classes: readonly string[];
	style: string;
	attrs: Readonly<Record<string, string>>;
	spec: unknown;
};

export type NodeDecorationInput = {
	readonly classes: ReadonlySet<string>;
	readonly attrs: Readonly<Record<string, string>>;
	readonly specs: readonly unknown[];
};

/** a collaborator at the widget's place: a new arrival (another peer, another textblock) shows the name again */
export type PeerCaretLook = { readonly name: string; readonly color: string; readonly arrival: number };

export type CanvasWidget =
	// drawn by the caret layer from state, or from the peer it names
	| { kind: 'caret'; peer?: PeerCaretLook }
	// laid out by the inline engine
	| { kind: 'struck'; runs: PMFragment; look: 'oldWords' | 'removedBreak'; id: string; tint: string }
	| { kind: 'inline'; build(ctx: FaceBuildContext): FaceElement; glueBefore?: boolean }
	| { kind: 'block'; build(ctx: FaceBuildContext): FaceElement }
	| { kind: 'lineEnd' }
	// a tr element
	| { kind: 'tableRow'; build(ctx: FaceBuildContext): FaceElement };

export type WidgetSpec = {
	key?: string;
	side?: number;
	canvas?: CanvasWidget;
	ignoreSelection?: boolean;
	stopEvent?: (e: Event) => boolean;
	destroy?: (node: unknown) => void;
};

export type WidgetDecorationView = {
	pos: number;
	side: number;
	key: string | undefined;
	spec: WidgetSpec;
	marks: readonly Mark[] | null;
	ignoreSelection: boolean;
};

export type FrameDecorations = {
	inline: readonly InlineDecorationView[];
	nodes: ReadonlyMap<number, NodeDecorationInput>;
	widgets: readonly WidgetDecorationView[];
};

/** an inline decoration resolved to its run style for the line pass (9.3) */
export type InlineDecorationPaint = {
	readonly from: number;
	readonly to: number;
	readonly style: RunStyle;
	/** pm-range-text reaches the line box; everything else hugs the content area */
	readonly reach: 'line' | 'text';
};

/** one placed line as the inline painter sees it, in canvas space before zoom */
export type LinePaintGeometry = {
	readonly line: LineBox;
	/** the origin line.y and xAt() count from */
	readonly top: number;
	readonly left: number;
	/** x of a document position on this line */
	xAt(pos: number): number;
	/** the box a run under the decoration fills, from the line's top: each run's own, as the DOM editor's inline boxes */
	runBand?(run: RunStyle, reach: 'line' | 'text'): { y: number; height: number };
};
