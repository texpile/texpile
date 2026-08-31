// The edit-class matrix: one row per scenario. `anchor` = unique substring whose middle
// receives the edit; `line` narrows to the source line containing it first. `op` is a pure
// string edit the driver applies to the buffer. `expect` = acceptable outcome(s) AT THE
// CEILING (the report compares measured vs ceiling, so below-ceiling rows show as gaps).
export const FIXTURES = [
	{
		name: 'basic',
		scenarios: [
			{ name: 'prose-short', anchor: 'baseline', expect: ['EXACT'] },
			{ name: 'prose-long-wrapped', anchor: 'breaker', expect: ['EXACT'] },
			{ name: 'heading-section', anchor: 'Alpha', line: '\\section{Alpha}', expect: ['EXACT'] },
			{ name: 'heading-subsection', anchor: 'Beta', line: '\\subsection{Beta}', expect: ['EXACT'] },
			{ name: 'runin-paragraph-title', anchor: 'Runin', expect: ['EXACT'] },
			{ name: 'runin-following-prose', anchor: 'onward', expect: ['EXACT'] },
			{ name: 'abstract-small-env', anchor: 'environment', expect: ['EXACT'] },
			{ name: 'ref-paragraph', anchor: 'resolution', expect: ['EXACT'] },
			{ name: 'item-middle-bullet', anchor: 'Middle bullet', expect: ['EXACT'] },
			// enumerate labels: the counter pin is a FIXED value now (no JS re-count of \item
			// lines), so a non-first item's label digit differs and the patch certifies
			// EXACT with the compile's counter log (the true enumi pin reproduces the label);
			// a recompile only when the log is missing and the 0 pin falls back
			{ name: 'enum-middle-item', anchor: 'Middle numbered', expect: ['EXACT'] },
			{ name: 'equation-body', anchor: '= m', expect: ['EXACT'] },
			{ name: 'tabular-cell', anchor: 'alpha & one', expect: ['EXACT'] },
			// footnote-bearing paragraphs always reconcile (the page-bottom note block is the
			// engine's to certify; the char-code note comparison was deleted)
			{ name: 'footnote-paragraph', anchor: 'carrying', expect: ['RECOMPILE'] },
			{ name: 'footnote-body-edit', anchor: 'Footnote body text', expect: ['RECOMPILE'], maxMs: 16000 },
			{ name: 'label-boundary-line', anchor: 'sec:alpha', line: '\\label{sec:alpha}', expect: ['RECOMPILE'] },
			{
				name: 'transient-unbalanced-math',
				anchor: 'Closing paragraph',
				op: { t: 'appendLine', text: ' $x_i' },
				thenOp: { t: 'appendLine', text: '$' },
				expect: ['EXACT', 'TRANSIENT']
			},
			{
				name: 'insert-paragraph',
				anchor: 'Closing paragraph',
				op: { t: 'insertPara', text: 'Freshly inserted paragraph stands alone here.' },
				expect: ['EXACT'],
				maxMs: 16000
			},
			{
				// the REAL writing flow: type in a paragraph (patched, baseline not advanced),
				// then open a new paragraph right after it -- merged into ONE patch
				name: 'edit-then-insert',
				preAnchor: 'exact tier',
				preOp: { t: 'insertMid' },
				anchor: 'much longer prose paragraph',
				op: { t: 'insertPara', text: 'Continuing thought in a brand new paragraph here.' },
				expect: ['EXACT'],
				maxMs: 16000
			},
			{
				// delete + pending edit takes the full pass (two splices alternated visually);
				// EXACT is also legitimate -- when the pending edit reconciled first the delete
				// becomes pure and can certify
				name: 'edit-then-delete',
				preAnchor: 'exercised',
				preOp: { t: 'insertMid' },
				anchor: 'heading merge scenario',
				op: { t: 'deletePara' },
				expect: ['RECOMPILE'],
				maxMs: 16000
			},
			{
				// deletes ride prev + \par + gone as ONE merged engine typeset. By this point
				// in the run the band sits at the page break, and a merged band that straddles
				// pages honestly takes the full pass (the cross-page matcher only handles
				// single-paragraph bands) -- RECOMPILE is at ceiling there, not a gap
				name: 'delete-paragraph',
				anchor: 'Freshly inserted',
				op: { t: 'deletePara' },
				expect: ['RECOMPILE'],
				maxMs: 16000
			},
			{
				// the ping-pong repro: a new paragraph whose next sibling is a numbered
				// heading must splice ABOVE the heading, not below its band
				name: 'insert-before-heading',
				anchor: 'subsection',
				line: '\\subsection',
				op: { t: 'insertPara', text: 'Inserted right before the subsection heading.' },
				expect: ['EXACT'],
				maxMs: 16000
			},
			{
				// env-anchored insert: rides the WHOLE equation env as one merged engine
				// typeset (env + \par + new paragraph), so TeX supplies the indent after the
				// display -- no JS indent rule, no splice-below-anchor path
				name: 'insert-after-equation',
				anchor: 'tabular',
				line: '\\begin{tabular}',
				op: { t: 'insertPara', text: 'Inserted directly below the display, wrapping with enough words to make two lines.' },
				expect: ['EXACT'],
				maxMs: 16000
			},
			{
				// a typed \noindent changes the paragraph's command set -> the patch may render
				// but never claim exact; the scheduled reconcile paints the engine's truth.
				// (This used to be SILENT-stale: identical render, no reconcile ever.)
				name: 'noindent-toggle',
				anchor: 'Short prose',
				op: { t: 'prefix', text: '\\noindent ' },
				expect: ['RECOMPILE'],
				maxMs: 16000
			}
		]
	},
	{
		name: 'twopage',
		scenarios: [
			{ name: 'page2-prose', anchor: 'pagetwobeta', expect: ['EXACT'] },
			{
				// a straddling paragraph recompiles: the chain that assembled cross-boundary
				// renders is gone (its EXACT claims graded 13.6% wrong)
				name: 'cross-page-span',
				anchor: 'straddle',
				expect: ['RECOMPILE'],
				maxMs: 16000
			},
			{
				// the certified hop can land this push on page 2 (seam + receiver calibrate)
				name: 'overflow-full-page',
				anchor: 'fillerthree',
				op: { t: 'append', text: ' overflow overflow overflow overflow overflow overflow overflow overflow' },
				expect: ['EXACT'],
				maxMs: 16000
			},
			{
				name: 'underflow-shrink',
				anchor: 'fillerfive carries steady prose',
				op: { t: 'deleteAfter', n: 90 },
				expect: ['EXACT'],
				maxMs: 16000
			}
		]
	},
	{
		// flushbottom two-column article: growth here always crosses a column, and a moved
		// every interior column here is FULL, so a push needs a second hop and recompiles;
		// the certified single hop shows on twopage/overflow-full-page, whose receiver has room
		name: 'twocol',
		scenarios: [
			{ name: 'twocol-prose', anchor: 'colfiller five', expect: ['EXACT'] },
			{
				name: 'twocol-push-nextcol',
				anchor: 'colfiller four considers',
				op: { t: 'append', text: ' plus an appended clause long enough to make this paragraph a full line taller than it was before' },
				expect: ['RECOMPILE'],
				maxMs: 16000
			},
			{
				name: 'twocol-push-nextpage',
				anchor: 'colfiller sixteen listens',
				op: { t: 'append', text: ' plus an appended clause long enough to make this paragraph a full line taller than it was before' },
				expect: ['RECOMPILE'],
				maxMs: 16000
			},
			{
				name: 'twocol-pull',
				anchor: 'colfiller three describes',
				op: { t: 'deleteAfter', n: 90 },
				expect: ['EXACT'],
				maxMs: 16000
			}
		]
	},
	{
		name: 'floats',
		scenarios: [
			{ name: 'float-tabular-cell', anchor: 'cellalpha', expect: ['EXACT'] },
			{ name: 'float-figure-caption', anchor: 'Figure caption', expect: ['RECOMPILE'], maxMs: 16000 },
			{ name: 'float-table-caption', anchor: 'Table caption', expect: ['RECOMPILE'], maxMs: 16000 },
			{ name: 'inline-image-paragraph', anchor: 'inside prose', expect: ['EXACT'] }
		]
	},
	{
		name: 'cjk',
		scenarios: [
			{ name: 'cjk-prose', anchor: '字体', expect: ['EXACT'] },
			{ name: 'cjk-heading', anchor: '中文标题', line: '\\section', expect: ['EXACT'] },
			// paragraph spans two SOURCE lines: luatexja swallows the newline after a CJK char,
			// which the daemon only reproduces because it reads blocks through a real file
			{ name: 'cjk-wrapped-para', anchor: '同一段落', expect: ['EXACT'] }
		]
	},
	{
		name: 'bookdoc',
		scenarios: [
			{ name: 'book-prose', anchor: 'breaker', expect: ['EXACT'] },
			{ name: 'chapter-line', anchor: 'Opening', line: '\\chapter{Opening}', expect: ['RECOMPILE'], maxMs: 16000 },
			{
				// the engine page-break certificate's proving ground: a stretched book page
				// (display skip supplies the glue), a mid-page paragraph growing by a line
				name: 'book-stretch-grow',
				anchor: 'certificate machinery',
				op: { t: 'append', text: ' plus the appended clause that makes the paragraph one line taller than before' },
				expect: ['EXACT'],
				maxMs: 16000
			}
		]
	},
	{
		// the user's tutorial project: 11pt article, heavy preamble (tikz/mhchem/natbib),
		// \input fragments, bibtex -- the document both reported bugs came from
		name: 'tut',
		scenarios: [
			{ name: 'tut-prose', anchor: 'covers the', expect: ['EXACT'], maxMs: 25000 },
			{
				name: 'tut-insert-before-section',
				anchor: 'Switching between visual',
				line: '\\section{Switching',
				op: { t: 'insertPara', text: 'okay wfawfawfaw new thoughts typed here.' },
				expect: ['EXACT'],
				maxMs: 25000
			}
		]
	},
	{
		name: 'beamer',
		scenarios: [
			{ name: 'frame-prose', anchor: 'harness to edit', expect: ['EXACT'], maxMs: 16000 },
			{ name: 'slide-bullet-middle', anchor: 'Middle slide bullet', expect: ['EXACT'], maxMs: 16000 },
			{ name: 'slide-math-prose', anchor: 'extra words', expect: ['EXACT'], maxMs: 16000 },
			{ name: 'frame-title', anchor: 'Second Slide', line: '\\begin{frame}{Second Slide}', expect: ['RECOMPILE'], maxMs: 16000 }
		]
	},
	{
		// The ELIGIBILITY gate's own fixture: which edits may be sent to the engine at all.
		// Every other fixture edits plain prose, so the two candidate gates -- a sorted diff of
		// command NAMES, and a structural proof that only text moved -- answer identically on
		// all of them and the sweep cannot tell them apart. These rows are the difference.
		name: 'cmdedits',
		scenarios: [
			// CONTROL: no commands anywhere. Both gates must let it through, or the fixture
			// itself is what refuses and nothing below means anything.
			{ name: 'plain-prose', anchor: 'control row', expect: ['EXACT'] },

			// MEANING THE COMMAND NAME CANNOT CARRY. A name-set diff reads each of these as
			// unchanged and renders it: a wrong page, adopted as truth, with no compile behind.
			{ name: 'section-star', anchor: '\\section', line: '\\section{Alpha}', op: { t: 'append', text: '*' }, expect: ['RECOMPILE'] },
			{ name: 'vspace-argument', anchor: '10pt', line: '\\vspace{10pt}', op: { t: 'append', text: '0' }, expect: ['RECOMPILE'] },
			{ name: 'gdef-argument', anchor: '2.0', line: '\\gdef\\vernum{2.0}', op: { t: 'append', text: '1' }, expect: ['RECOMPILE'] },

			// THE STRICTER SIDE: text inside an argument, inside math, inside a list body. A
			// name-set diff calls these plain text edits and renders them. The structural gate
			// refuses, because the text inside \input{} decides which FILE is read and no
			// vocabulary-free rule separates that argument from a formatting one. Whether the
			// coverage this costs is worth the safety is exactly what these rows measure.
			{ name: 'inside-emph', anchor: 'emphasised span', expect: ['EXACT'] },
			{ name: 'inside-inline-math', anchor: 'a + b = c', expect: ['EXACT'] },
			{ name: 'inside-list-item', anchor: 'Middle bullet item', expect: ['EXACT'] },

			// prose that USES a macro without touching it: nothing about the command moved, so
			// both gates should render, and the structural one must not refuse on presence alone
			{ name: 'prose-using-macro', anchor: 'continues with enough', expect: ['EXACT'] }
		]
	}
];

/** Apply a scenario's edit to the buffer; returns the new buffer or null if the anchor is missing. */
export function applyOp(src, sc) {
	const lines = src.split('\n');
	let li = -1;
	if (sc.line) li = lines.findIndex((l) => l.includes(sc.line) && l.includes(sc.anchor));
	if (li < 0) li = lines.findIndex((l) => l.includes(sc.anchor));
	if (li < 0) return null;
	const ln = lines[li];
	const a0 = ln.indexOf(sc.anchor);
	const op = sc.op ?? { t: 'insertMid' };
	if (op.t === 'insertMid' || op.t === undefined) {
		const at = a0 + Math.floor(sc.anchor.length / 2);
		lines[li] = ln.slice(0, at) + 'x' + ln.slice(at);
	} else if (op.t === 'append') {
		const at = a0 + sc.anchor.length;
		lines[li] = ln.slice(0, at) + op.text + ln.slice(at);
	} else if (op.t === 'appendLine') {
		lines[li] = ln + op.text;
	} else if (op.t === 'prefix') {
		lines[li] = op.text + ln;
	} else if (op.t === 'deleteAfter') {
		const at = a0 + sc.anchor.length;
		lines[li] = ln.slice(0, at) + ln.slice(at + op.n);
	} else if (op.t === 'insertPara') {
		lines.splice(li, 0, op.text, '');
	} else if (op.t === 'deletePara') {
		let s = li;
		while (s > 0 && lines[s - 1].trim() !== '') s--;
		let e = li;
		while (e + 1 < lines.length && lines[e + 1].trim() !== '') e++;
		// remove the block plus ONE adjacent blank so exactly one paragraph disappears
		const extra = e + 1 < lines.length && lines[e + 1].trim() === '' ? 1 : 0;
		lines.splice(s, e - s + 1 + extra);
	} else {
		return null;
	}
	return lines.join('\n');
}
