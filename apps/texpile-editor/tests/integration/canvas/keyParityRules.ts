// what keyParity.spec leaves out or reads otherwise than P0 recorded, each with its reason and the package that closes it

/** a kind of row the replay does not compare exactly, counted in the spec's annotations */
export type Excuse = { owner: string; reason: string };

/** rows the DOM editor's recorder or the spec drops before a replay */
export const LEFT_OUT = {
	unstableStart: {
		owner: 'P0 fixtures',
		reason: 'a start the recorder marked unstable: two replays of the DOM editor disagreed (README of the key fixtures)'
	},
	unstableRow: {
		owner: 'P0 fixtures',
		reason: 'a row the recorder marked unstable: the DOM editor itself answered differently between replays'
	},
	pageKeys: { owner: 'W1', reason: 'the page keys follow the recorded rule of pointer/ (keyRules.spec), not row by row' },
	paragraphKeys: { owner: 'W1', reason: "Ctrl+Up and Ctrl+Down go to a paragraph's edges, where P0 kept Chromium's column" },
	accident: { owner: 'W1', reason: 'the DOM editor handled the start by accident (ACCIDENTS)' },
	movedByDom: { owner: 'W1', reason: "the DOM editor's Shift character rows moved the caret of the start inside a cluster" },
	selectedFormula: { owner: 'W8', reason: "a selected formula: W8's math sessions own its keys (mathCaretParity.spec)" },
	authorBlock: {
		owner: 'W12',
		reason:
			'a start at the author block of the ieee class: it takes the gap and caret rules of every drawn block, and 84 percent of its rows are unstable'
	}
} satisfies Record<string, Excuse>;

/** rows replayed whose outcome differs from P0's for a reason outside W1; each count is capped per document by EXCUSE_BUDGET */
export const EXCUSES = {
	layout: {
		owner: 'W5, W11 and W12',
		reason:
			'a line move from a start whose line breaks or caret x differ from P0 (a face laid out unlike P0, or text widths measured otherwise)'
	},
	chipFace: { owner: 'W11', reason: 'a row beside an inline chip that no canvas face draws yet, which P0 stepped over as one character' },
	rawFace: {
		owner: 'W11 and W12',
		reason:
			'the row ends at or in a raw block that P0 draws as a non-editable block (\\maketitle, a figure card) and the canvas still shows as editable source'
	},
	islandCaret: {
		owner: 'W9',
		reason:
			"the row starts or ends in a raw or code block or an inline raw chip: from a selected block or the gap beside one P0's CodeMirror took the caret at the block's start, and a line move into one landed by CodeMirror's own line boxes"
	},
	destination: {
		owner: 'W5, W8, W11 and W12',
		reason:
			'a line or paragraph move that ends in a table or in a textblock holding a formula or chip, whose cells, formula or chip the canvas lays out a few pixels unlike P0'
	},
	rounding: {
		owner: 'M1',
		reason:
			'a line move that lands up to three characters from P0 because the measured text widths put a boundary on the other side of the x'
	},
	stayed: {
		owner: 'W11 and W12',
		reason:
			"P0's key moved nothing because its DOM selection stood in a heading number, a caption label or another widget, and the canvas moves on"
	},
	gapOrNode: {
		owner: 'W12',
		reason:
			'P0 ended on a gap cursor or a node selection where the canvas puts a text caret (the edge of a Typst grid cell, the place after a deletion)'
	}
} satisfies Record<string, Excuse>;

export type ExcuseId = keyof typeof EXCUSES;

export type SkippedStart = { cat: RegExp; docs?: RegExp; leftOut: keyof typeof LEFT_OUT };

/** starts left out whole; each counts under its own LEFT_OUT entry */
export const SKIPPED_STARTS: SkippedStart[] = [
	{ cat: /^(inline-math-node|display-node)$/, leftOut: 'selectedFormula' },
	{ cat: /^raw-block-(node|start)$/, docs: /ieee/, leftOut: 'authorBlock' }
];

/** rows the live DOM editor answers otherwise than P0 recorded (five tries of five, 2026-11-17), by document and row label */
export const LIVE_DOM: Record<string, Record<string, string>> = {
	'parity-typ-body/main.typ': { 'display-gap-after gap 2014 2014 char-left': 'node 1986 2014' }
};

/** a word extend over exactly one drawn chip selects it, as over \ref; the DOM editor's range end read inside the chip, or its anchor jumped to the chip's far edge (the Typst label) (04-m2.md W11) */
export const CHIP_RULE: Record<string, Record<string, string>> = {
	'keys-chips/chips.tex': {
		'chip-before 21 Shift+Control+ArrowRight': 'node 21 43',
		'chip-after 43 Shift+Control+ArrowLeft': 'node 21 43',
		'chip-before 105 Shift+Control+ArrowRight': 'node 105 120'
	},
	'keys-chips/chips.typ': {
		'chip-before 16 Shift+Control+ArrowRight': 'node 16 25',
		'chip-before 99 Shift+Control+ArrowRight': 'node 99 121',
		'chip-after 121 Shift+Control+ArrowLeft': 'node 99 121'
	}
};

export const SWEEP_OWN = ['keys-sweep/sweep.tex', 'keys-sweep/sweep.typ', 'keys-sweep/sweep.md'];

/** rows whose start the DOM editor handled by accident: it did not move, or moved by a generated widget */
export type Accident = { cat: RegExp; key: RegExp; docs?: RegExp; reason: string };
export const ACCIDENTS: Accident[] = [
	{
		cat: /^empty-paragraph$/,
		key: /^word-right\+shift$/,
		docs: /README\.md$/,
		reason: "P0's word row stopped at the next paragraph start where its character row went three characters in"
	},
	{
		cat: /^heading-(middle|end)$/,
		key: /^word-left(\+shift)?$/,
		reason: "Chromium's Ctrl+Left did not move in a numbered heading; the canvas goes to the word's start"
	}
];

/** rows that differ from P0 and match no excuse above: one entry for each family, with the reason; an entry no row of its document matches fails the spec */
export type KnownGap = { docs: RegExp; row: RegExp; reason: string };
const CHIP_ANCHOR =
	"P0's Shift+Ctrl+Arrow beside a footnote chip put the anchor on the chip's far edge; the canvas selects the chip, as it does for \\ref";
const OVER_CHIPS =
	"W11: P0's Shift+Ctrl+Right from an empty paragraph ran over the next line's chips to its first word; the canvas stops after the first chip";
const TERM_TITLE = "W12: a Typst term's title and description are separate editing hosts in P0, so its word moves stop at their edges";
const CARD_EDGE = "W12: P0 draws a figure or a frame title as a card, and a range from its caption or title stops at the card's edge";
const CAPTION_CHIP_WORD =
	"P0's Ctrl+Right from the end of a table's notes passed over the caption chip that opens the next textblock; the canvas stops at that textblock's start, as before any other chip";
const FIGURE_BODY =
	"P0 jumped from a Typst figure's caption past its drawn body to text far before or after the figure (Chromium leaving a contenteditable=false block); the canvas stops at the body's edge";
const NODE_HOME =
	"P0's Home and End from a selected frame ran inside its content; from the other 23 selected blocks they left the selection alone";
const TWO_DISPLAYS = "P0's ArrowLeft from the gap after three displays in a row selected the second, skipping the display beside the gap";
const STYLE_LIFT =
	"Harness: the app's Backspace at the start of a theorem's first paragraph lifts it out through liftFromStyleEnvironment, which reads the style environments of the loaded packages; the harness page keeps that list empty for this document even with its insert offers installed";
const TABLE_COLUMN =
	"Up and Down out of a table cell keep the goal column, as every line move does (the caret engine); P0's prosemirror-tables arrows went to the start of the next cell or the edge of the text past the table";
const IMAGE_CARD =
	"W1: P0's Shift+Ctrl+Left and Shift+Ctrl+Up from a heading stop in the caption of the image above it, which the canvas passes because the text search skips an atom; plain moves pass the image in P0 too";
const WHOLE_STOP =
	'The canvas selects a block drawn whole (\\maketitle, a comment line, an algorithmic or \\institute card, a Typst outline or environment) as one stop from either side; P0 stepped over it or into its source';
const DECK_GAPS =
	"P0's Shift+Left and Shift+Up from the gap at the top of the first slide made a range from the far side of the title page; the canvas leaves the gap alone";
const DOC_END_GAP =
	'The canvas takes Ctrl+End to the gap after a table that ends the document, its last stop, where ArrowRight from the caption goes too; P0 went to the end of the caption';
const GAP_RANGE =
	"P0's Shift+Right from the gap before a code block selected its first word in CodeMirror; the canvas puts the caret at the block's start, where the next Shift key starts the range";

export const KNOWN_GAPS: KnownGap[] = [
	{ docs: /beamer/, row: /^x-(footnote|pause|alert)-chip-(before|after) .*word-(right|left)\+shift/, reason: CHIP_ANCHOR },
	{ docs: /beamer/, row: /^x-frame-title-.*word-(left|right)\+shift/, reason: CARD_EDGE },
	{ docs: /beamer/, row: /^frame-node .*line-(start|end)/, reason: NODE_HOME },
	{ docs: /parity-tex-body/, row: /^x-footnote-chip-(before|after) .*word-(right|left)\+shift/, reason: CHIP_ANCHOR },
	{ docs: /parity-tex-body/, row: /^x-figure-caption-(start|end) .*word-(left|right)\+shift/, reason: CARD_EDGE },
	{ docs: /parity-tex-body/, row: /^x-float-caption-end .*word-right\+shift/, reason: CARD_EDGE },
	{ docs: /parity-tex-body/, row: /^display-gap-after gap 2065 2065 char-left/, reason: TWO_DISPLAYS },
	{ docs: /theorems/, row: /^empty-paragraph text 430 430 word-right\+shift/, reason: OVER_CHIPS },
	{ docs: /parity-tex-body/, row: /^x-theorem-end text 3604 3604 word-right/, reason: CAPTION_CHIP_WORD },
	{ docs: /parity-typ-body/, row: /^raw-block-node .*line-(start|end)/, reason: NODE_HOME },
	{
		docs: /parity-typ-body/,
		row: /^x-typ-figure-caption-(start|end) .*(char-left|delete-word-forward) /,
		reason: FIGURE_BODY
	},
	{ docs: /theorems/, row: /^chip-before text 19183 19183 delete-char-back/, reason: STYLE_LIFT },
	{ docs: /parity-typ-body/, row: /^x-term-/, reason: TERM_TITLE },
	{ docs: /parity-md-body/, row: /^heading-start .*word-left\+shift/, reason: IMAGE_CARD },
	{
		docs: /keys-sweep|parity-md-root\/(feature-sweep|typing)|parity-typ-body/,
		row: /^table-cell-(middle|end) .*line-(up|down) /,
		reason: TABLE_COLUMN
	},
	{ docs: /parity-tex-body/, row: /^x-float-caption-end .*(char|word)-right /, reason: WHOLE_STOP },
	{ docs: /llncs/, row: /^heading-start text 419 419 (char|word)-left /, reason: WHOLE_STOP },
	{ docs: /llncs/, row: /^empty-paragraph text 83 83 (char|word)-right /, reason: WHOLE_STOP },
	{ docs: /parity-tex-tables/, row: /^textblock-end text 28070 28070 (char|word)-right /, reason: WHOLE_STOP },
	{ docs: /parity-tex-tables/, row: /^heading-start text 34444 34444 (char|word)-left /, reason: WHOLE_STOP },
	{ docs: /parity-typ-body/, row: /^(textblock|x-blockquote)-start text 1248 1248 (char|word)-left /, reason: WHOLE_STOP },
	{ docs: /parity-typ-body/, row: /^x-typ-env-(start|middle|end) .*(char|word)-left /, reason: WHOLE_STOP },
	{ docs: /parity-typ-body/, row: /^x-typ-figure-caption-(start|middle) .*word-left /, reason: FIGURE_BODY },
	{ docs: /theorems/, row: /^textblock-end text 1627 1627 word-right /, reason: WHOLE_STOP },
	{ docs: /drawn\.pristine/, row: /^empty-paragraph text 54 54 (char|word)-right /, reason: WHOLE_STOP },
	{ docs: /beamer/, row: /^x-titlepage-gap-before .*(char-left|line-up)\+shift/, reason: DECK_GAPS },
	{ docs: /typst-report/, row: / document-end /, reason: DOC_END_GAP },
	{ docs: /gone-kinds/, row: /^display-gap-after .*char-right\+shift/, reason: GAP_RANGE }
];
