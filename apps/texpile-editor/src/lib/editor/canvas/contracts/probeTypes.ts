import type { CanvasHit, CursorKind } from './geometryTypes';
import type { DocRect } from './layoutTypes';
import type { EditorLanguage } from './viewTypes';

/** one drawing call a frame made, in doc space (drawListRecorder.ts) */
export type PaintOpRecord = {
	readonly op: 'fillRect' | 'strokeRect' | 'fillText' | 'image' | 'path' | 'line';
	readonly rect: DocRect;
	readonly text?: string;
	readonly font?: string;
	/** the canvas fill or stroke string */
	readonly color?: string;
};

export type CanvasProbe = {
	/** every mounted visual editor: pane, language, path */
	views(): ProbeView[];
	active(): ProbeView | null;
};

/** the active formula session (W8): client px; `caretBox` is where MathLive's .ML__caret span stands */
export type ProbeMathSession = {
	pos: number;
	source: string;
	caret: DOMRect | null;
	offset: number;
	ranges: [number, number][];
	lastOffset: number;
	mode: string;
	formula: DOMRect;
	caretBox: { x: number; top: number; height: number } | null;
	selectionRects: DOMRect[];
};

export type ProbeView = {
	readonly pane: string;
	readonly language: EditorLanguage;
	readonly path: string;
	posOf(needle: string, nth?: number): number;
	textBetween(from: number, to: number): string;
	clientPointOf(pos: number, side?: -1 | 1): { x: number; y: number };
	/** caret rect */
	rectOf(pos: number): DOMRect | null;
	rectOfNode(pos: number): DOMRect | null;
	lines(blockPos: number): {
		from: number;
		to: number;
		text: string;
		top: number;
		height: number;
		baseline: number;
		hyphen: boolean;
		justified: boolean;
	}[];
	/** the lines of text the last frame painted that cross the pane, where they show now, client px; none while held */
	paintedLines(): { frame: number; lines: { text: string; top: number; baseline: number; left: number }[] };
	query(selector: string): {
		tag: string;
		classes: string[];
		attrs: Record<string, string>;
		text: string;
		rect: DOMRect;
		pos: number | null;
	}[];
	drawList(blockPos: number): readonly PaintOpRecord[];
	carets(): { kind: 'local' | 'blur' | 'gap' | 'math' | 'island' | 'remote'; rect: DOMRect; visible: boolean; label?: string }[];
	selectionRects(): DOMRect[];
	hitAt(x: number, y: number): CanvasHit | null;
	hoverAt(x: number, y: number): { cursor: CursorKind; hint: string | null; chain: string[] };
	overlays(): { key: string; rect: DOMRect }[];
	select(anchor: number, head?: number): void;
	/** puts top-level block `index` (clamped) `offset` px under the pane's top edge, for the drive kits' anchored shots */
	scrollToBlock(index: number, offset: number): { index: number; count: number };
	frameStats(): {
		frames: number;
		lastLayoutMs: number;
		lastPaintMs: number;
		blocksLaidOut: number;
		keyToFrameMs: number[];
		/** getComputedStyle reads so far: the theme tokens' probe, once per theme change */
		styleReads: number;
		/** ms spent resolving element styles since the view opened */
		styleMs: number;
		/** ms of the theme token and ground reads, the browser's own style recalculation */
		themeReadMs: number;
		/** ms the frames spent resolving styles up to the first screen; null before it */
		firstScreenStyleMs: number | null;
		/** device pixels the last frame painted (2.5: a scroll over painted rows paints none, a key its block's band) */
		lastPaintedPx: number;
		/** rows that came on screen before an idle slice painted them */
		lateRows: number;
		/** device pixels the content rows hold */
		rowPixels: number;
	};
	/** no layout, bitmap, formula or grammar pending in view */
	settle(): Promise<void>;
	errors(): { pos: number; type: string; message: string }[];
	math: {
		active(): ProbeMathSession | null;
		/** sets MathLive's selection in the active session, as the field's `selection` setter does */
		select(ranges: [number, number][]): void;
	};
	islands: { active(): { pos: number; kind: 'raw' | 'chip' | 'code'; ranges: { from: number; to: number }[] } | null };
};
