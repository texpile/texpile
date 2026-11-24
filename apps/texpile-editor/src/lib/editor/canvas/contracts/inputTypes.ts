import type { FaceElement } from '../tree/faceElement';

/** the completion popup's keys while it is open, ahead of everything (14.5) */
export type CompletionKeys = { keydown(event: KeyboardEvent): boolean };

/** offsets into the text mirror */
export type MirrorRange = { start: number; end: number };

/** the caret's textblock (or island text) as a string: characters one to one, inline leaves as U+FFFC, hard_break as \n */
export type TextMirror = {
	readonly text: string;
	/** the document position of text[0] */
	readonly start: number;
	readonly selection: MirrorRange;
	toDoc(offset: number): number;
	fromDoc(pos: number): number;
};

export type InputSurface = {
	/** the root div.ProseMirror (EditContext) or the textarea */
	readonly element: HTMLElement;
	readonly kind: 'editContext' | 'textarea';
	focus(): void;
	hasFocus(): boolean;
	/** after every update and frame: the caret block's text window, the selection, the caret's client rect */
	sync(mirror: TextMirror, caret: DOMRect | null, control: DOMRect): void;
	destroy(): void;
};

export type InputSink = {
	keydown(event: KeyboardEvent): boolean;
	text(text: string, range: MirrorRange, composing: boolean): void;
	compositionStart(): void;
	compositionEnd(committed: string): void;
	/** textformatupdate: the input method's underline segments, mirror offsets */
	compositionFormats(formats: readonly { range: MirrorRange; thickness: 'none' | 'thin' | 'thick' }[]): void;
	inputType(inputType: string, text: string | null, range: MirrorRange | null): void;
	clipboard(event: ClipboardEvent): void;
	focusChanged(): void;
	/** the caret block's text now: the surface writes it back after each change it reported */
	mirror(): TextMirror;
	/** characterboundsupdate: one client rect per mirror offset */
	characterBounds(range: MirrorRange): DOMRect[];
};

/** what the pointer is over (11.7) */
export type HoverState = {
	readonly chain: readonly FaceElement[];
	readonly pos: number | null;
	readonly part: string | null;
	/** the top-level block and the table under the pointer, for the block handle and table chrome */
	readonly blockFor: number | null;
	readonly tableFor: number | null;
};
