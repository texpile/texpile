import { describe, expect, it } from 'vitest';
import { textOnlyEdit } from '$lib/draft/heuristics/eligibility/textOnlyEdit';

// The gate cmdsOf used to hold, inverted: instead of enumerating which commands escape their
// group (a blacklist that can never cover a user macro or a class-defined one), prove the
// parse is identical and let the leftover be text. Every case cmdsOf gets WRONG today is a
// case where a command's meaning changed without its NAME changing.

describe('an edit that only moved text', () => {
	it('lets a word into a plain paragraph', () => {
		expect(textOnlyEdit('The quick fox jumps.', 'The quick brown fox jumps.')).toBe(true);
	});

	it('lets text change around a command that did not move', () => {
		expect(textOnlyEdit('See \\ref{fig:a} for detail.', 'See \\ref{fig:a} for more detail.')).toBe(true);
	});

	it('does not care that a word insert changes the node count', () => {
		// "a b" is string+whitespace+string; "a big b" is five nodes. A positional walk over
		// the raw list refuses every real edit, which is why whitespace is not structure.
		expect(textOnlyEdit('a b', 'a big b')).toBe(true);
	});
});

describe('an edit that moved something other than text', () => {
	it('refuses a star, which the command NAME does not carry', () => {
		// cmdsOf scrapes /\\[a-zA-Z@]+/, so both sides read as `\section` and it renders
		expect(textOnlyEdit('\\section{Intro}', '\\section*{Intro}')).toBe(false);
	});

	it('refuses an argument change, which the command name does not carry either', () => {
		// the silent-wrong-document case: \gdef escapes the daemon's group and every later
		// use of \ver changes, while the sorted name multiset is identical
		expect(textOnlyEdit('\\gdef\\ver{2.0} text', '\\gdef\\ver{3.0} text')).toBe(false);
		expect(textOnlyEdit('\\vspace{1cm} text', '\\vspace{5cm} text')).toBe(false);
	});

	it('refuses a command appearing or disappearing', () => {
		expect(textOnlyEdit('plain words here', 'plain \\textbf{words} here')).toBe(false);
		expect(textOnlyEdit('a \\newcommand{\\x}{y} b', 'a b')).toBe(false);
	});

	it('refuses a change inside a command argument', () => {
		// \input{a} -> \input{b} is technically a text change and includes a different file.
		// Text inside an argument is never running text, whatever the argument is for.
		expect(textOnlyEdit('\\input{chapters/one}', '\\input{chapters/two}')).toBe(false);
		expect(textOnlyEdit('\\textbf{cat}', '\\textbf{dog}')).toBe(false);
	});

	it('refuses a change inside math or an environment', () => {
		expect(textOnlyEdit('value $x + 1$ here', 'value $x + 2$ here')).toBe(false);
		expect(textOnlyEdit('\\begin{itemize}\\item a\\end{itemize}', '\\begin{itemize}\\item b\\end{itemize}')).toBe(false);
	});

	it('lets the text INSIDE a comment change, which never becomes ink', () => {
		// the old name-diff gate stripped comments; refusing them here made every keystroke
		// while typing a note cost a recompile
		expect(textOnlyEdit('text % note\nmore', 'text % other longer note\nmore')).toBe(true);
	});

	it('still refuses a comment appearing or vanishing', () => {
		// a trailing % eats the newline and rejoins words: presence is structural
		expect(textOnlyEdit('prose here\nmore', 'prose here %\nmore')).toBe(false);
		expect(textOnlyEdit('prose here %x\nmore', 'prose here\nmore')).toBe(false);
	});
});

describe('the failure that would defeat the whole check', () => {
	it('refuses a block it cannot read rather than calling two unreadable blocks equal', () => {
		// an empty parse compared against another empty parse is TRUE on any structural
		// test; that is the one way this gate opens silently, so it is answered here
		expect(textOnlyEdit('', '')).toBe(false);
		expect(textOnlyEdit('   ', 'text')).toBe(false);
		expect(textOnlyEdit('text', '')).toBe(false);
	});
});
