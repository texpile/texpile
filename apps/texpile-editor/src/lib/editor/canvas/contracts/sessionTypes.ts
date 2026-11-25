import type { Node as PMNode } from 'prosemirror-model';
import type {
	EditorState as CMEditorState,
	SelectionRange,
	Transaction as CMTransaction,
	TransactionSpec as CMTransactionSpec
} from '@codemirror/state';
import type { Direction } from '@codemirror/view';
import type { HeadlessMathfield, MathLayout } from 'mathlive';
import type { CompletionKeys } from './inputTypes';
import type { NestedEditor } from './nodeViewTypes';

/** em units; the fork's layoutBox result (ML/core/box-layout.ts, 13.2) */
export type { MathColor, MathLayout, MathPaintItem, MathRect } from 'mathlive';

/** the fork's field with no element: E2's members and the keyboard delegate (13.5) */
export type { HeadlessMathfield } from 'mathlive';

export type MathSession = NestedEditor & {
	readonly kind: 'math';
	/** the formula's position, mapped through every transaction */
	readonly pos: number;
	readonly field: HeadlessMathfield;
	readonly layout: MathLayout;
	readonly display: boolean;
	/** an overflowing display scrolls horizontally (E8) */
	scrollX: number;
	caretClientRect(): DOMRect | null;
	/** where MathLive's .ML__caret span stands, for the caret oracle (13.10) */
	caretElementRect(): DOMRect | null;
	selectionClientRects(): DOMRect[];
	atomClientRect(id: string): DOMRect | null;
	macroCallClientRect(index: number): DOMRect | null;
	formulaClientRect(): DOMRect;
};

/** what @codemirror/commands, @codemirror/autocomplete and the latex input handlers call on a view (14.3) */
export type IslandCmView = {
	readonly state: CMEditorState;
	/** one PM transaction */
	dispatch(...specs: (CMTransaction | CMTransactionSpec)[]): void;
	readonly composing: false;
	readonly compositionStarted: false;
	hasFocus: boolean;
	moveByChar(start: SelectionRange, forward: boolean, by?: (initial: string) => (next: string) => boolean): SelectionRange;
	moveByGroup(start: SelectionRange, forward: boolean): SelectionRange;
	moveToLineBoundary(start: SelectionRange, forward: boolean, includeWrap?: boolean): SelectionRange;
	moveVertically(start: SelectionRange, forward: boolean, distance?: number): SelectionRange;
	lineBlockAt(pos: number): { from: number; to: number; top: number; bottom: number; height: number };
	coordsAtPos(pos: number, side?: -1 | 1): { left: number; right: number; top: number; bottom: number } | null;
	posAtCoords(coords: { x: number; y: number }): number | null;
	textDirectionAt(pos: number): Direction;
	readonly defaultLineHeight: number;
	readonly lineWrapping: boolean;
	readonly scrollDOM: { clientHeight: number; scrollHeight: number; getBoundingClientRect(): DOMRect };
	readonly contentDOM: { ownerDocument: Document };
	readonly dom: { ownerDocument: Document };
};

/** the island's completion: sources, activation, the popup (14.5) */
export type CompletionDriver = {
	readonly open: boolean;
	readonly keys: CompletionKeys;
	activate(explicit: boolean): void;
	close(): void;
	destroy(): void;
};

export type CodeIsland = NestedEditor & {
	readonly kind: 'code';
	readonly pos: number;
	readonly node: PMNode;
	readonly island: 'raw' | 'chip' | 'code';
	/** doc = node text; selection = main range (mirrored to PM) + secondary ranges */
	readonly cm: CMEditorState;
	readonly shim: IslandCmView;
	readonly completion: CompletionDriver | null;
};
