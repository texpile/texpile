// the EditContext API as Chromium ships it; TypeScript's DOM library does not declare it yet

export type EditContextTextFormat = {
	readonly rangeStart: number;
	readonly rangeEnd: number;
	readonly underlineStyle: string;
	readonly underlineThickness: string;
};

export type EditContextTextUpdate = Event & {
	readonly updateRangeStart: number;
	readonly updateRangeEnd: number;
	readonly text: string;
	readonly selectionStart: number;
	readonly selectionEnd: number;
};

export type EditContextFormatUpdate = Event & { getTextFormats(): EditContextTextFormat[] };
export type EditContextBoundsRequest = Event & { readonly rangeStart: number; readonly rangeEnd: number };

export type EditContextApi = EventTarget & {
	readonly text: string;
	readonly selectionStart: number;
	readonly selectionEnd: number;
	updateText(rangeStart: number, rangeEnd: number, text: string): void;
	updateSelection(start: number, end: number): void;
	updateControlBounds(bounds: DOMRect): void;
	updateSelectionBounds(bounds: DOMRect): void;
	updateCharacterBounds(rangeStart: number, bounds: DOMRect[]): void;
};

export type EditContextHost = HTMLElement & { editContext: EditContextApi | null };
export type EditContextWindow = Window & { EditContext: new () => EditContextApi };
