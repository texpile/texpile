// The engine's record stream, as a type the compiler can check.
//
// Every shape here is transcribed from the emit sites in electron/lua/walker.lua and
// page-extract.lua -- nothing is inferred from how the renderer happens to read them. The
// wire names are terse and stay terse for now; what this file adds is that `PageRecord` used
// to be `any`, so nothing in 88 files was checked and a record could be read for a field it
// never carries. That is not hypothetical: the daemon's `line` and the page's `pl` are the
// same object under two tags, and splicing one where the other belonged went unnoticed for
// weeks because no type separated them. They are separate members here for that reason.
//
// Coordinates are TeX points. `y` on every box-like record is the BASELINE, not the top.

/** where the walker puts an optional source stamp: which source line set this material */
type Sourced = {
	/** source line (page-extract's texpile_para stamps a paragraph ONCE, at its start) */
	s?: number;
	/** source file id, present only when the document has more than one */
	sf?: number;
};

/** the column ordinal a page record belongs to, from the \box255 attribute stamp */
type Columned = {
	/** NOTE: `c` here is a COLUMN number. On a glyph or rule, `col` is a COLOUR string, and
	 *  `col` is also a record type. Three meanings across two names -- do not conflate them. */
	c?: number;
};

type Box = { x: number; y: number; w: number; h: number; d: number };

/** a paragraph line box on a SHIPPED page. The daemon's equivalent is `LineRecord`. */
export type PlRecord = { t: 'pl' } & Box & Sourced & Columned;

/** a paragraph line box from the DAEMON's single-block typeset. Same thing as `pl`, different
 *  tag, and it carries the glue state a shipped page has already resolved. Translated to `pl`
 *  when a patch's band enters the record store (patch/recordsAfterPatch bandRecord). */
export type LineRecord = {
	t: 'line';
	/** line ordinal within the typeset block */
	n: number;
	/** the line's own shift: 0 for prose, nonzero for a centred display */
	gset: number;
	gsign: number;
	gord: number;
	/** width the walk accounted for, via node.rangedimensions */
	rdw: number;
} & Box;

export type GlyphRecord = {
	t: 'g';
	/** character code */
	c: number;
	/** font id, resolved against a `font` record */
	f: number;
	x: number;
	y: number;
	w: number;
	/** font expansion factor (\adjustspacing) */
	ef?: number;
	xo?: number;
	yo?: number;
	/** COLOUR, as a string. Not a column. */
	col?: string;
	/** glyph index, for harf-shaped or private-use-area math glyphs */
	gi?: number;
};

export type FontRecord = { t: 'font'; id: number; size: number; name: string; file: string };

/** vertical glue: `w` is the EFFECTIVE width as set, `nw` the natural width before stretch */
export type VGlueRecord = {
	t: 'vg';
	x: number;
	y: number;
	w: number;
	nw: number;
	st: number;
	sto: number;
	sh: number;
	sho: number;
};

/** an interline kern; carries real height but no x, so consumers take it positionally */
export type VKernRecord = { t: 'vk'; y: number; w: number; z?: 1 };

export type PenaltyRecord = { t: 'pen'; y: number; p: number };

/** the box the engine built a column in. `gs`/`gsn`/`gord` are its vpack glue state:
 *  gord 0 means it packed to its goal rather than resting at natural size. */
export type ColumnRecord = { t: 'col'; i: number; gs: number; gsn: number; gord: number } & Box;
export type ColumnEndRecord = { t: 'colend' };

/** a footnote group: \insert material, emitted with n-prefixed inner records */
export type NoteRecord = { t: 'note'; cls: number; h: number };
export type NoteEndRecord = { t: 'noteend' };

export type RuleRecord = { t: 'rule'; col?: string } & Box;
export type ImageRecord = { t: 'image'; col?: string } & Box;
export type VBoxRecord = { t: 'vbox' } & Box;
/** a pdf literal: drawn material the walker can flag but not interpret */
export type LitRecord = { t: 'lit' } & Box;

/** the walker's own check that it placed a line where the engine said: `dev` is its
 *  disagreement with the line's target width, and is 0 on every page of every fixture */
export type EndXRecord = { t: 'endx'; n: number; x: number; target: number; dev: number; justified: number };

/** anything the walker emits for a SHIPPED page */
export type PageRecord =
	| PlRecord
	| GlyphRecord
	| FontRecord
	| VGlueRecord
	| VKernRecord
	| PenaltyRecord
	| ColumnRecord
	| ColumnEndRecord
	| NoteRecord
	| NoteEndRecord
	| RuleRecord
	| ImageRecord
	| VBoxRecord
	| LitRecord;

/** anything the DAEMON emits for one typeset block */
export type DaemonRecord = LineRecord | GlyphRecord | FontRecord | RuleRecord | ImageRecord | EndXRecord;

export type AnyRecord = PageRecord | DaemonRecord;

/** records that carry a y and can be placed vertically */
export type PlacedRecord = Extract<AnyRecord, { y: number }>;
