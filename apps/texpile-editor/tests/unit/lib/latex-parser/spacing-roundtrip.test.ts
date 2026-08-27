// Spacing that reaches the editor must be able to get home again. Every case here was silently
// lossy before: a tie arrived as a visible tilde, \, collapsed to a plain space, \! vanished
// outright, and \ldots left a non-ASCII byte in the .tex with no way back.
import { describe, it, expect } from 'vitest';
import type { Mark } from 'prosemirror-model';
import { latexToProseMirror } from '../../../../src/lib/languages/latex/parser/converter';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';

/** the doc's own text, which is what the visual editor puts on screen */
function shown(src: string): string {
	const { doc } = latexToProseMirror(src, {});
	return [...JSON.stringify(doc).matchAll(/"text":("(?:[^"\\]|\\.)*")/g)].map((m) => JSON.parse(m[1] as string)).join('');
}

/** the serializer appends the paragraph's own \par; it is not part of what we are asserting */
function rt(src: string): string {
	const { doc } = latexToProseMirror(src, {});
	return serializeToLatex(doc)
		.replace(/\s*\\par\s*$/, '')
		.trim();
}

describe('a ~ tie', () => {
	it('reaches the editor as a no-break space, not as a tilde', () => {
		expect(shown('Table~\\ref{tab:x}')).toContain('Table\u00A0');
		expect(shown('Table~\\ref{tab:x}')).not.toContain('~');
	});

	it('goes home as ~ rather than as a raw U+00A0 byte', () => {
		expect(rt('Table~\\ref{tab:x}')).toBe('Table~\\ref{tab:x}');
		expect(rt('Fig.~1 and 5~kg')).toBe('Fig.~1 and 5~kg');
	});
});

describe('a tilde typed into the visual editor', () => {
	// NOT the same as a ~ in source, which is a tie and stays one. This is someone writing a path
	// or a URL in prose: emitted bare it would compile to a tie and vanish from the PDF.
	function typed(text: string, marks: Mark[] = []): string {
		const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text, marks)])]);
		return serializeToLatex(doc)
			.replace(/\s*\\par\s*$/, '')
			.trim();
	}

	it('is escaped so it survives to the page', () => {
		expect(typed('see ~/docs for it')).toBe('see \\textasciitilde{}/docs for it');
	});

	it('is left alone inside code, whose bytes are literal', () => {
		expect(typed('a~b', [schema.marks.code.create()])).toBe('\\texttt{a~b}');
	});

	it('does not swallow a real no-break space sitting beside it', () => {
		expect(typed('~/docs\u00A0here')).toBe('\\textasciitilde{}/docs~here');
	});
});

describe('text-mode spacing macros', () => {
	// no plain space says what these say, so they stay raw rather than being approximated away
	it.each(['about 5\\,kg of it', '10\\,000 items', 'a\\!b', 'a\\quad b', 'a\\qquad b', 'a\\;b', 'a\\:b'])('round-trips %s', (src) => {
		expect(rt(src)).toBe(src);
	});

	it('still keeps \\vspace and \\hspace verbatim', () => {
		expect(rt('a \\hspace{1em} b')).toBe('a \\hspace{1em} b');
	});
});

describe('math', () => {
	// math carries its own source, so it was never at risk - this is the guard that keeps it so
	it('is untouched by any of it', () => {
		expect(rt('$\\int f\\,dx$')).toBe('$\\int f\\,dx$');
		expect(rt('$a~b$')).toBe('$a~b$');
	});
});

describe('an ellipsis', () => {
	it('goes back to \\ldots instead of leaving a non-ASCII byte behind', () => {
		expect(rt('a\\ldots b')).toBe('a\\ldots{} b');
	});
});
