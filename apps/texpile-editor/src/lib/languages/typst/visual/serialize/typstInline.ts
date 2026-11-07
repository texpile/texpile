// the inline layer: text escaping, mark delimiters, and mark-aware run rendering
import type { Node, Mark } from 'prosemirror-model';
import { codeEndsBefore } from './codeExtent';
import { codeReadsOn, continuesCode, extendsRef, extendsUrl, readsOn } from './readsOn';
import { createShadow, markupPlaceholder } from '$lib/serializer/shadowLeaves';
import { escLineStart, escTypst, typStr } from './typstEscapes';
import type { TypstRun, TypstRunCore } from '../core/plugin/typstDocumentPlugin';
import { inlineSaves, markSaves, textSaves, wholeRun } from '../core/plugin/documentMap';

// marks nest in the document list's order, outermost first; one with no wrap of its own (inline raw) is written inside its run
const MARK_ORDER = [...markSaves.keys()];

function orderedMarks(marks: readonly Mark[]): Mark[] {
	return marks.filter((m) => markSaves.has(m.type.name)).sort((a, b) => MARK_ORDER.indexOf(a.type.name) - MARK_ORDER.indexOf(b.type.name));
}

/** a text leaf one of its marks writes itself */
function textRun(node: Node, core: TypstRunCore): TypstRun | null {
	for (const write of textSaves) {
		const run = write(node, core);
		if (run) return run;
	}
	return null;
}

// nodes whose handler output is one run: their bytes come from attrs, not from text leaves
const HANDLER_LEAVES = new Set(['raw_latex', 'includedoc']);

export function isTypHandlerLeaf(node: Node): boolean {
	return HANDLER_LEAVES.has(node.type.name) || wholeRun(node);
}

/** the shadow run that finds every leaf of a regenerated block in its text; see shadowLeaves */
export const typstShadow = createShadow({
	placeholder: markupPlaceholder,
	// `@`, `-` and `/` are escaped only by what follows them
	charEmissions: (ch) => [escTypst(ch), '\\' + ch, ch],
	isHandlerLeaf: isTypHandlerLeaf
});

/** a whole block comment, which typst reads as nothing: what follows one keeps its place on the line */
const BLOCK_COMMENT = /^\/\*(?:(?!\*\/)[\s\S])*\*\/$/;

type InlineRun = TypstRun;

function buildRuns(parent: Node, startOfLine: boolean, extra: string, singleLine: boolean): InlineRun[] {
	const runs: InlineRun[] = [];
	let atLineStart = startOfLine;
	const core: TypstRunCore = { shadowed: (node, text) => typstShadow.shadowed(node, text), marks: orderedMarks, singleLine };
	parent.forEach((node) => {
		const own = node.isText ? null : inlineSaves.get(node.type.name);
		if (own) {
			const run = own(node, core);
			if (run) {
				runs.push(run);
				atLineStart = run.startsLine ?? false;
			}
			return;
		}
		const written = node.isText ? textRun(node, core) : null;
		if (written) {
			runs.push(written);
			atLineStart = false;
			return;
		}
		if (node.isText) {
			const text = node.text ?? '';
			// a space typed after a hard break stays on the break's line (typst drops
			// indentation after a line end, so `\` + newline + space would lose it)
			const prev = runs[runs.length - 1];
			const marks = orderedMarks(node.marks);
			if (prev?.kind === 'break' && /^[ \t]/.test(text) && marks.length === 0) prev.content = '\\';
			runs.push({ content: typstShadow.shadowed(node, escTypst(text, atLineStart, extra)), marks, kind: 'text' });
			atLineStart = false;
			return;
		}
		switch (node.type.name) {
			case 'inline_latex': {
				const text = node.textContent;
				runs.push({
					content: typstShadow.shadowed(node, text),
					marks: orderedMarks(node.marks),
					kind: text.startsWith('//') ? 'comment' : 'other'
				});
				// a block comment is nothing to typst: a marker after one that opens a line opens a list
				if (BLOCK_COMMENT.test(text)) return;
				break;
			}
			default:
				runs.push({ content: node.isLeaf ? '' : renderInline(node, false), marks: orderedMarks(node.marks), kind: 'other' });
		}
		atLineStart = false;
	});
	return runs.filter((r) => r.content !== '');
}

function commonPrefixLen(a: readonly Mark[], b: readonly Mark[]): number {
	let n = 0;
	while (n < a.length && n < b.length && a[n].eq(b[n])) n++;
	return n;
}

/** typst's in_word test: `*` and `_` are literal between two alphanumerics */
function isAlnum(ch: string | undefined): boolean {
	return ch != null && /[\p{L}\p{N}]/u.test(ch);
}

/** the run index where the mark at position `k` of run `r` closes */
function spanEnd(runs: InlineRun[], r: number, k: number): number {
	let j = r;
	while (j + 1 < runs.length && commonPrefixLen(runs[j].marks, runs[j + 1].marks) > k) j++;
	return j;
}

/** the character emitted right after the mark at position `k` closes behind run `end`; '' when
 *  a delimiter comes first */
function charAfterSpan(runs: InlineRun[], end: number, k: number): string {
	const next = runs[end + 1];
	if (!next) return '';
	const keep = commonPrefixLen(runs[end].marks, next.marks);
	if (k !== keep || next.marks.length > keep) return '';
	return next.content[0] ?? '';
}

type ActiveMark = { mark: Mark; close: string; expel: boolean; call?: boolean };

const KEYWORD_CODE = /^#(if|for|while|context)\b/;

type RenderedInline = {
	out: string;
	openComment: boolean;
	endsHeading: boolean;
};

/** minimal open/close mark transitions over same-mark runs, expelling boundary whitespace out
 *  of emphasis delimiters (`* bold*` never parses back as strong). */
export function renderInline(parent: Node, startOfLine = true, extra = '', singleLine = false): string {
	return render(parent, startOfLine, extra, singleLine, '').out;
}

export function renderHeadingLine(parent: Node, after: string): string | null {
	const r = render(parent, false, '', true, after);
	return r.endsHeading ? null : r.out;
}

export function renderBody(parent: Node): string {
	const r = render(parent, true, '', false, '');
	const out = r.out.replace(/^[ \t]+|[ \t]+$/g, '');
	// a line break ending the body is a backslash and the space after it: trimmed, the backslash
	// would escape the closing `]`
	return r.openComment || /(^|[^\\])(\\\\)*\\$/.test(out) ? out + '\n' : out;
}

function render(parent: Node, startOfLine: boolean, extra: string, singleLine: boolean, after: string): RenderedInline {
	const runs = buildRuns(parent, startOfLine, extra, singleLine);
	const keywordChips: { start: number; end: number }[] = [];
	let out = '';
	let active: ActiveMark[] = [];
	// where the last @ref was written, while the next emission may still extend it
	let refAt = -1;
	let refEnd = -1;
	let refTarget = '';
	let urlEnd = -1;
	let urlStart = -1;
	let codeEnd = -1;
	let code = '';
	// a // comment owns the rest of its line: the next emission starts a new one
	let lineEnd = false;
	// where a /* */ comment ended: its closing slash pairs with nothing after it
	let blockEnd = -1;
	// the last run written that was not whitespace alone, and where it ended
	let solid: { run: InlineRun; end: number } | null = null;

	function emit(s: string, text = false) {
		if (!s) return;
		let piece = s;
		if (refAt >= 0) {
			const since = out.slice(refEnd);
			if (extendsRef(since + piece)) {
				// the call form ends a code expression: `.`, `(` or `[` straight after it would go on with it
				if (since === '') {
					out = out.slice(0, refAt) + `#ref(<${refTarget}>)`;
					codeEnd = out.length;
					code = '#ref()';
				}
				// a `.` or `:` written after the marker joins its target once what follows it would
				// (`@eq:mass._`): escaped, it ends the marker
				else out = out.slice(0, refEnd) + '\\' + since;
				refAt = -1;
			} else if (!/^[.:]*$/.test(since + piece)) refAt = -1;
		}
		const escapable = text && !piece.startsWith('u{');
		if (urlEnd === out.length && extendsUrl(piece)) {
			if (escapable) piece = '\\' + piece;
			else {
				const start = urlStart >= 0 ? urlStart : out.search(/https?:\/\/\S*$/);
				out = out.slice(0, start) + `#link(${typStr(out.slice(start))})`;
				codeEnd = out.length;
				code = '#link()';
			}
		}
		urlEnd = -1;
		if (escapable && codeEnd === out.length && !KEYWORD_CODE.test(code) && continuesCode(code, piece)) piece = '\\' + piece;
		codeEnd = -1;
		if (escapable && /^[\p{L}\p{N}\p{M}\p{Pc}-]/u.test(piece) && /(^|[^\\])(\\\\)*@$/.test(out)) piece = '\\' + piece;
		// an emphasis delimiter is an identifier character to a reference: the `@` before it is escaped instead
		if (!escapable && /^[_*]/.test(piece) && /(^|[^\\])(\\\\)*@$/.test(out)) out = out.slice(0, -1) + '\\@';
		if (/^[/*]/.test(piece) && out.length !== blockEnd && /(^|[^\\])(\\\\)*\/$/.test(out)) out = out.slice(0, -1) + '\\/';
		else if (piece.startsWith('/') && /(^|[^\\])(\\\\)*\*$/.test(out)) piece = (escapable ? '\\' : ' ') + piece;
		out += piece;
	}

	function emitCloses(closing: ActiveMark[], allowSteal: boolean) {
		let stolen = '';
		if (allowSteal && closing.some((a) => a.expel)) {
			const ws = out.match(/(\s+)$/);
			// the whitespace stays inside where the delimiter would go on as more of what it follows:
			// `_see @key _`, not `_see @key_`, a reference to `key_`
			const first = closing.find((a) => a.close)?.close ?? '';
			const held = !!ws && solid?.end === out.length - ws[1].length && readsOn(solid.run, first);
			if (ws && ws[1].length < out.length && !held) {
				out = out.slice(0, -ws[1].length);
				stolen = ws[1];
			}
		}
		for (const a of closing) {
			emit(a.close);
			// a mark written as a call (`#text(fill: ..)[..]`) ends a code expression: text going
			// straight on from its `]` with `.`, `(` or `[` would read as more of the call
			if (a.call && a.close.endsWith(']')) {
				codeEnd = out.length;
				code = '#';
			}
		}
		emit(stolen);
	}

	for (let r = 0; r < runs.length; r++) {
		const run = runs[r];
		let content = run.content;
		let newLine = false;
		if (lineEnd) {
			emit('\n');
			lineEnd = false;
			newLine = true;
			if (run.kind === 'text') content = escLineStart(content.replace(/^[ \t]+/, ''));
		}
		const keep = commonPrefixLen(
			active.map((a) => a.mark),
			run.marks
		);
		emitCloses(active.slice(keep).reverse(), !newLine);
		active = active.slice(0, keep);
		let bracketBody = false;
		for (let k = keep; k < run.marks.length; k++) {
			const m = run.marks[k];
			const d = markSaves.get(m.type.name)?.(m.attrs);
			if (!d) {
				active.push({ mark: m, close: '', expel: false });
				continue;
			}
			if (!d.expel) {
				emit(d.open);
				active.push({ mark: m, close: d.close, expel: false, call: d.open.startsWith('#') });
				bracketBody = d.open.endsWith('[');
				continue;
			}
			const end = spanEnd(runs, r, k);
			// emphasis over nothing but whitespace has no delimiters: `__` would be literal
			if (runs.slice(r, end + 1).every((x) => x.kind === 'text' && x.content.trim() === '')) {
				active.push({ mark: m, close: '', expel: false });
				continue;
			}
			// `*` and `_` are literal between two alphanumerics, so an intraword boundary on
			// either side takes the function form
			const intraword =
				(isAlnum(out[out.length - 1]) && isAlnum(content[0])) ||
				(isAlnum(runs[end].content[runs[end].content.length - 1]) && isAlnum(charAfterSpan(runs, end, k)));
			// so does a delimiter against a code expression it would go on with (`#sym.alpha_`): a
			// reference or a url beside one takes its call form instead, a code chip has none
			const againstCode = (solid?.end === out.length && codeReadsOn(solid.run, d.open)) || codeReadsOn(runs[end], d.close);
			if (intraword || againstCode) {
				emit(d.inWord?.open ?? '');
				active.push({ mark: m, close: d.inWord?.close ?? '', expel: false, call: true });
				bracketBody = true;
				continue;
			}
			if (run.kind === 'text') {
				const lead = content.match(/^\s+/);
				if (lead && lead[0].length < content.length) {
					emit(lead[0]);
					content = content.slice(lead[0].length);
				}
			}
			emit(d.open);
			active.push({ mark: m, close: d.close, expel: true });
			bracketBody = false;
		}
		// a `[` body starts fresh markup, where a marker binds like at a line start
		if (bracketBody && run.kind === 'text') content = escLineStart(content);
		emit(content, run.kind === 'text');
		if (content.trim()) solid = { run, end: out.length };
		if (run.kind === 'other' && (run.url || /^https?:\/\/\S+$/.test(content))) {
			urlEnd = out.length;
			urlStart = run.url ? out.length - content.length : -1;
		}
		if (run.kind === 'other' && /^\/\*[\s\S]*\*\/$/.test(content)) blockEnd = out.length;
		if (run.kind === 'other' && content.startsWith('#')) {
			codeEnd = out.length;
			code = content;
			if (KEYWORD_CODE.test(content)) keywordChips.push({ start: out.length - content.length, end: out.length });
		}
		if (run.kind === 'ref') {
			refAt = out.length - content.length;
			refEnd = out.length;
			refTarget = content.slice(1);
		}
		if (run.kind === 'comment') lineEnd = true;
	}
	const closes = active.some((a) => a.close);
	if (lineEnd && closes) emit('\n');
	emitCloses([...active].reverse(), !lineEnd);
	let endsHeading = runs.some((r) => r.kind === 'comment' || (r.kind === 'other' && /^<[^<>]*>$/.test(r.content)));
	for (const { start, end } of keywordChips.reverse()) {
		const eol = out.indexOf('\n', end);
		const rest = eol < 0 ? out.slice(end) : out.slice(end, eol);
		const line = eol < 0 ? rest + after : rest;
		if (!line.trim() || codeEndsBefore(out.slice(start, end), line)) continue;
		endsHeading = true;
		if (!singleLine) out = out.slice(0, end) + '\n' + escLineStart(rest.replace(/^[ \t]+/, '')) + out.slice(end + rest.length);
	}
	return { out, openComment: lineEnd && !closes, endsHeading };
}
