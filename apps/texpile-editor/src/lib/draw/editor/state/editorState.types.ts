/** the canvas's tools, by what each draws */
export type ToolId =
	| 'hand'
	| 'select'
	| 'text'
	| 'box'
	| 'diamond'
	| 'oval'
	| 'state'
	| 'plot'
	| 'component'
	| 'line'
	| 'arrow'
	| 'curve'
	| 'pen'
	| 'rect'
	| 'ellipse'
	| 'polygon'
	| 'axes'
	| 'dimension'
	| 'trim';
/** the host's own undo, when the text lives in a document with a history of its own */
export type HostHistory = { undo: () => void; redo: () => void };
