import type { EditorView as CMView } from '@codemirror/view';
import type { EditorView as PMView } from 'prosemirror-view';

/** the one thing every set's symbols have: a key recents are kept by, and the tab it is browsed under */
export type PickerSymbol = { id: string; group: string };

/**
 * What a tile draws: a character in a math face, a word for a character with no ink, or the part of
 * a picture that shows the symbol as its typesetter draws it. `boxHeight` is the height every
 * picture of the set was drawn to fit, which they are all scaled from alike.
 */
export type SymbolGlyph =
	| { kind: 'text'; text: string }
	| { kind: 'label'; text: string }
	| {
			kind: 'picture';
			url: string;
			x: number;
			y: number;
			width: number;
			height: number;
			boxHeight: number;
			sheetWidth: number;
			sheetHeight: number;
	  };

/** the lines under a symbol's name in the detail row; a note is a label and a piece of code */
export type SymbolDetailLines = { name: string; description?: string; note?: { label: string; code: string } };

/** the editor a picked symbol goes into: the source view in source mode, the visual one otherwise */
export type SymbolTarget = { kind: 'source'; view: CMView } | { kind: 'visual'; view: PMView };

export type SymbolCatalog<S extends PickerSymbol> = { list: readonly S[]; byId: (id: string) => S | undefined };

/** a language's symbols, and how the picker shows, finds and writes them */
export type SymbolSet<S extends PickerSymbol> = {
	/** the tabs, in order */
	groups(): readonly string[];
	groupLabel(group: string): string;
	/** the table, loaded on first open: too big to ship with the editor for a dialog few open */
	load(): Promise<SymbolCatalog<S>>;
	search(list: readonly S[], query: string, recent: readonly string[]): S[];
	glyph(symbol: S): SymbolGlyph;
	/** what a screen reader says for a tile */
	spokenLabel(symbol: S): string;
	detail(symbol: S): SymbolDetailLines;
	searchPlaceholder(): string;
	/** ids picked lately, most recent first */
	recent(): readonly string[];
	remember(id: string): void;
	insert(target: SymbolTarget, symbol: S): void;
	/** what choosing `symbol` would write at the caret */
	insertionText(target: SymbolTarget, symbol: S): string;
};
