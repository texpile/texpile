// text escaping and inline-mark wrapping for the LaTeX serializer
import type { Node, Mark } from 'prosemirror-model';

const ESCAPE_RE = /[\\{}#%&$_^]/g;
const ESCAPE_MAP: Record<string, string> = {
	'\\': '\\textbackslash{}',
	'{': '\\{',
	'}': '\\}',
	'#': '\\#',
	'%': '\\%',
	'&': '\\&',
	$: '\\$',
	_: '\\_',
	'^': '\\textasciicircum{}'
};

/** text-mode escaping, single pass (runs per text node on every serialization). */
export function sanitizeText(text: string): string {
	return text.replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]);
}

export function joinInline(pieces: string[]): string {
	let out = '';
	for (const piece of pieces) {
		// if the previous chunk ends in a control word and this one starts with a letter, direct
		// concatenation FUSES them into an undefined command (\answerYes + See = \answerYesSee;
		// happens when a separating construct didn't survive conversion). a single space restores
		// the boundary and is render-neutral: TeX eats whitespace after a control word. purely
		// lexical, runs on serialized output where no AST exists. only the tail needs testing (an
		// end-anchored regex on the whole accumulator is quadratic across pieces); 256 chars is
		// far past any real control-word length.
		if (piece && /\\[a-zA-Z@]+$/.test(out.slice(-256)) && /^[a-zA-Z]/.test(piece)) out += ' ';
		// A comment owns a WHOLE line, both ends: emitted mid-line it would swallow the rest of the
		// line, and it arrived from source on its own line (a raw '%' can only open a comment chip;
		// escaped text starts with \%). With serializeNode closing the line after the chip, comment
		// chips are a round-trip fixed point instead of degrading into strippable trailing comments.
		if (piece.startsWith('%') && out && !out.endsWith('\n')) out += '\n';
		out += piece;
	}
	return out;
}

export type EscMode = 'text' | 'href' | 'math' | 'verbatim' | 'raw';

/** The single escaper. Only `text` mutates; href/math/verbatim/raw pass through. */
export function esc(value: string, mode: EscMode = 'text'): string {
	return mode === 'text' ? sanitizeText(value) : value;
}

/**
 * A mark's color as xcolor reads it: whatever the file wrote, or a CSS color (one copied from a
 * Typst file) in the model that takes it; null for a CSS color no model takes.
 */
function xcolorOf(color: unknown, model: unknown): { model: string; value: string } | null {
	const value = String(color ?? '').trim();
	if (typeof model === 'string' && model) return { model, value };
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)?.[1];
	if (hex) return { model: 'HTML', value: (hex.length === 3 ? hex.replace(/./g, '$&$&') : hex).toUpperCase() };
	const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(value);
	if (rgb) return { model: 'RGB', value: rgb.slice(1, 4).join(',') };
	return /^#|^[a-z]+\(/i.test(value) ? null : { model: '', value };
}

// a color xcolor cannot read drops its wrapper and keeps the text, as the Typst serializer does
function textcolorMark(a: Record<string, unknown>): { open: string; close: string } {
	const c = xcolorOf(a.color ?? 'black', a.model);
	return c ? { open: `\\textcolor${c.model ? `[${c.model}]` : ''}{${esc(c.value)}}{`, close: '}' } : { open: '', close: '' };
}

// \sethlcolor takes a color name, never a model, so a color only a model can say highlights in the default one
function highlightMark(a: Record<string, unknown>): { open: string; close: string } {
	if (a.cmd === 'colorbox') {
		const box = xcolorOf(a.color ?? 'yellow', a.model);
		if (box) return { open: `\\colorbox${box.model ? `[${box.model}]` : ''}{${esc(box.value)}}{`, close: '}' };
	}
	const c = a.color == null ? null : xcolorOf(a.color, null);
	return c && !c.model ? { open: `{\\sethlcolor{${esc(c.value)}}\\hl{`, close: '}}' } : { open: '\\hl{', close: '}' };
}

// em is \textit unless the file said \emph; highlight is soul's \hl. href escapes only % and #, which
// break it inside another command's argument and which hyperref reads back as themselves
const MARKS: Record<string, (attrs: Record<string, unknown>) => { open: string; close: string }> = {
	strong: () => ({ open: '\\textbf{', close: '}' }),
	em: (a) => (a.cmd === 'emph' ? { open: '\\emph{', close: '}' } : { open: '\\textit{', close: '}' }),
	u: () => ({ open: '\\underline{', close: '}' }),
	sup: () => ({ open: '\\textsuperscript{', close: '}' }),
	sub: () => ({ open: '\\textsubscript{', close: '}' }),
	code: () => ({ open: '\\texttt{', close: '}' }),
	link: (a) => ({ open: `\\href{${String(a.href ?? '').replace(/(?<!\\)[%#]/g, '\\$&')}}{`, close: '}' }),
	textcolor: textcolorMark,
	highlight: highlightMark
};

/**
 * a bare \url{href} parses to a link whose text IS the href; if unedited, round-trip \url back
 * instead of widening to \href{href}{href} (a visible styling change under most hyperref setups).
 * compares against the esc()'d href: `text` is already text-escaped, but \url's own argument must
 * stay RAW. Returns the call, or null when the text no longer says the href
 */
export type BareUrl = (text: string, href: string) => string | null;

function plainBareUrl(text: string, href: string): string | null {
	return text === esc(href, 'text') ? `\\url{${href}}` : null;
}

let bareUrl: BareUrl = plainBareUrl;

/** the source map's shadow run stands in for the text; it decides the same way on what the text stood for */
export function setBareUrl(fn: BareUrl | null): void {
	bareUrl = fn ?? plainBareUrl;
}

/** Wrap `result` in each mark's open/close pair, inner to outer. shared with non-text leaves
 * that carry marks (an unknown macro chip under \textbf has no text node to carry the bold). */
export function applyMarks(text: string, marks: readonly Mark[]): string {
	let result = text;
	for (const mark of marks) {
		if (mark.type.name === 'link' && mark.attrs?.bare) {
			const url = bareUrl(result, String(mark.attrs.href ?? ''));
			if (url !== null) {
				result = url;
				continue;
			}
		}
		const make = MARKS[mark.type.name];
		if (!make) continue;
		const { open, close } = make(mark.attrs ?? {});
		result = open + result + close;
	}
	return result;
}

/** The marks a node's own handler wraps around it (text, and leaf atoms borrowing a mark);
 * null for anything else, which renderChildren's run-merge leaves untouched. */
export function markableMarks(node: Node): readonly Mark[] | null {
	return node.isText || node.type.spec.leafText ? node.marks : null;
}

/** Order-sensitive on purpose: same set in a different order must NOT merge
 * (\textbf{\texttt{X}} vs \texttt{\textbf{X}} are different commands), so require exact match. */
export function marksKey(marks: readonly Mark[]): string {
	return marks.map((m) => `${m.type.name}:${JSON.stringify(m.attrs)}`).join('|');
}

// character by character: every rule below maps one character to its bytes, which is what lets
// the source map tell a text leaf's characters apart
export function bareTextString(text: string, isCode: boolean): string {
	let result = esc(text, 'text');
	// a pasted tab becomes one space: there's no clean tab mapping and a space is idempotent.
	// a bare " stays as-is: \texttt{"} re-parses to a code mark and compounds every save.
	result = result.replace(/\t/g, ' ');
	// Every tie became a no-break space on the way in, so a tilde still here is one someone typed
	// meaning the character - emitted bare it would compile to a tie and vanish from the PDF.
	// MUST run before the no-break space goes back to ~, or it would escape that one too. Code
	// keeps its literal bytes and never had the tie converted, so it is left alone.
	if (!isCode) result = result.replace(/~/g, '\\textasciitilde{}');
	// a no-break space (from a ~ tie) must go back to ~, not a raw U+00A0 byte (renders
	// differently without inputenc, and is unfaithful to the source either way).
	result = result.replace(/\u00A0/g, '~');
	// typographic chars become LaTeX ligatures so the .tex stays ASCII and round-trips; skipped
	// in code, where they are literal.
	if (!isCode) {
		result = result
			.replace(/\u2014/g, '---')
			.replace(/\u2013/g, '--')
			.replace(/\u201C/g, '``')
			.replace(/\u201D/g, "''")
			.replace(/\u2018/g, '`')
			.replace(/\u2019/g, "'")
			// \ldots reads back as U+2026, which had no way home and left a non-ASCII byte behind
			.replace(/\u2026/g, '\\ldots{}');
	}
	return result;
}
