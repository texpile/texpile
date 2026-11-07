// text escaping and inline-mark wrapping for the LaTeX serializer
import type { Node, Mark } from 'prosemirror-model';
import { commonFacts } from '../knowledge/commands/commandFacts';
import { TEXT_LIGATURES, TIE } from '../textLigatures';

// the command written for a character several commands print: \ldots over \dots, \textless over \textlessthan
const ESCAPED = ['textbackslash', '{', '}', '#', '%', '&', '$', '_', 'textasciicircum'];
const TEXT_SYMBOLS = ['textless', 'textgreater', 'textbar'];
const TILDE = 'textasciitilde';
const ELLIPSIS = 'ldots';

// a control word takes an empty group so the next letter is not read as part of its name
function spellCommand(name: string): string {
	return /^[a-zA-Z]+$/.test(name) ? `\\${name}{}` : `\\${name}`;
}

function spellingsOf(names: string[]): Map<string, string> {
	const out = new Map<string, string>();
	for (const name of names) {
		const { prints } = commonFacts(name);
		if (prints && !out.has(prints)) out.set(prints, spellCommand(name));
	}
	return out;
}

const ESCAPE_MAP = spellingsOf(ESCAPED);
const TEXT_SYMBOL = spellingsOf(TEXT_SYMBOLS);
const TILDE_SPELLING = spellingsOf([TILDE]);
const ELLIPSIS_SPELLING = spellingsOf([ELLIPSIS]);
const LIGATURE_OF = new Map(TEXT_LIGATURES.map((l) => [l.prints, l.input]));

function charClass(chars: Iterable<string>): RegExp {
	return new RegExp(`[${[...chars].map((c) => c.replace(/[\\\]^-]/g, '\\$&')).join('')}]`, 'g');
}
const ESCAPE_RE = charClass(ESCAPE_MAP.keys());
const TEXT_SYMBOL_RE = charClass(TEXT_SYMBOL.keys());
const TILDE_RE = charClass(TILDE_SPELLING.keys());
const ELLIPSIS_RE = charClass(ELLIPSIS_SPELLING.keys());
const LIGATURE_RE = charClass(LIGATURE_OF.keys());
const TIE_RE = charClass([TIE.prints]);

/** text-mode escaping, single pass (runs per text node on every serialization). */
export function sanitizeText(text: string): string {
	return text.replace(ESCAPE_RE, (ch) => ESCAPE_MAP.get(ch)!);
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
		if (piece.startsWith('%') && out) {
			// a space left after the line the last comment ended would make that line blank, a new paragraph
			const bare = out.replace(/[ \t]+$/, '');
			out = bare.endsWith('\n') ? bare : `${out}\n`;
		}
		out += piece;
	}
	return out;
}

// % consumes to the newline, so one is restored here, inside any mark, or what follows is commented out
export function lineEnded(node: Node, text: string): string {
	return node.type.name === 'inline_latex' && text.startsWith('%') && !text.endsWith('\n') ? `${text}\n` : text;
}

// a comment opening a mark's group starts its own line, the line end after the brace eaten as the source wrote it
export function ownLine(inner: string): string {
	return inner.startsWith('%') ? `%\n${inner}` : inner;
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
export function xcolorOf(color: unknown, model: unknown): { model: string; value: string } | null {
	const value = String(color ?? '').trim();
	if (typeof model === 'string' && model) return { model, value };
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)?.[1];
	if (hex) return { model: 'HTML', value: (hex.length === 3 ? hex.replace(/./g, '$&$&') : hex).toUpperCase() };
	const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(value);
	if (rgb) return { model: 'RGB', value: rgb.slice(1, 4).join(',') };
	return /^#|^[a-z]+\(/i.test(value) ? null : { model: '', value };
}

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

/** the \url the text still says, or null */
export function bareUrlOf(text: string, href: string): string | null {
	return bareUrl(text, href);
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
	if (!isCode) result = result.replace(TILDE_RE, (ch) => TILDE_SPELLING.get(ch)!);
	// in LaTeX's default font encoding a bare < > | in text draws as ¡ ¿ and a dash; the text commands
	// draw the characters in every encoding, and read back as them
	if (!isCode) result = result.replace(TEXT_SYMBOL_RE, (ch) => TEXT_SYMBOL.get(ch)!);
	// a no-break space (from a ~ tie) must go back to ~, not a raw U+00A0 byte (renders
	// differently without inputenc, and is unfaithful to the source either way).
	result = result.replace(TIE_RE, TIE.input);
	// typographic chars become LaTeX ligatures so the .tex stays ASCII and round-trips; skipped
	// in code, where they are literal.
	if (!isCode) {
		result = result.replace(LIGATURE_RE, (ch) => LIGATURE_OF.get(ch)!);
		// \ldots reads back as U+2026, which had no way home and left a non-ASCII byte behind
		result = result.replace(ELLIPSIS_RE, (ch) => ELLIPSIS_SPELLING.get(ch)!);
	}
	return result;
}
