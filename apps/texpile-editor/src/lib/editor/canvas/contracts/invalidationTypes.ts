export type StoreName =
	| 'drawnInputs'
	| 'labels'
	| 'references'
	| 'glossary'
	| 'ownMacros'
	| 'typstNames'
	| 'typstScope'
	| 'printedNumbers'
	| 'compiledNumbers'
	| 'deckPreamble'
	| 'titleBlock'
	| 'mathMacros';

export type FaceInputKey =
	// a file path with its crop, turn and DPR variant
	| { kind: 'bitmap'; source: string }
	// TikZ or CeTZ card picture (G20)
	| { kind: 'figurePicture'; source: string }
	// (syntax, source, macros epoch, display)
	| { kind: 'math'; key: string }
	// an async Lezer grammar arrived
	| { kind: 'grammar'; language: string }
	| { kind: 'store'; name: StoreName }
	// includedoc, .bib files, raw figure probes
	| { kind: 'file'; path: string }
	// an overlay slot's measured size
	| { kind: 'overlay'; key: string }
	| { kind: 'epoch'; name: 'style' | 'fonts' | 'hyphenation' | 'faces' };

/** where sources report a changed input; only laid-out nodes recorded keys, so what is on screen relays (8.5) */
export type FaceInvalidation = {
	fire(key: FaceInputKey): void;
	/** the listener a view registers; returns the way to stop listening */
	listen(listener: (key: FaceInputKey) => void): () => void;
};
