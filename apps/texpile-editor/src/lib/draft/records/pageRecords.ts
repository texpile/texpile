// Reads a compiled page's record stream and says what may be painted from it -- nothing else.
// Split out of DraftView so both decisions can be tested against real engine output (see
// tests/fixtures/lang) rather than only through a canvas.

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ParsedPage = { records: any[]; dropped: number };

/**
 * Parse one page's newline-delimited records, skipping any line the engine wrote in a form we
 * cannot read.
 *
 * The skipping is the point. This was a plain `.map(JSON.parse)`, and the walker emitted the
 * font record with the font's name interpolated raw -- luaotfload quotes that name whenever the
 * family has a space, so `\setmainfont{Times New Roman}` produced an unparseable line and the
 * throw escaped all the way out of the page render, leaving an unsized canvas and a blank grey
 * page. One bad record should cost one record.
 */
export function parseRecords(jsonl: string): ParsedPage {
	const records: any[] = [];
	let dropped = 0;
	for (const line of jsonl.split('\n')) {
		if (!line) continue;
		try {
			records.push(JSON.parse(line));
		} catch {
			dropped++;
		}
	}
	return { records, dropped };
}

/**
 * Is this page's record geometry unusable because the page is not left-to-right?
 *
 * The walker accumulates x left-to-right in node order, but LuaTeX reverses right-to-left
 * material in the backend, after the shipout hook that produced these records has run. The
 * records are therefore in logical order while the PDF is in visual order, and drawing them
 * paints the line mirrored. Such a page has to come from the exact-PDF raster instead.
 *
 * `unc` is the walker's comma-joined certification reasons for the page. Only `dir` disqualifies
 * the whole page: `literal`, `transform` and `escape` mark individual regions that the walk
 * already emits as pixel crops.
 */
export function pageIsRtl(unc: string | undefined): boolean {
	return !!unc && unc.split(',').includes('dir');
}
