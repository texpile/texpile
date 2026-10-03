import { describe, it, expect } from 'vitest';
import { detectEol, toLf, fromLf } from '../../../../src/lib/workspace/fileSystem';
import { parseLatexFile, serializeLatexFile } from '../../../../src/lib/workspace/latexRoundtrip';

// the editor works in LF internally (CodeMirror normalizes to LF; the verbatim-offset layer
// indexes one consistent string). the file's original ending is read on load and re-applied on
// save so a Windows CRLF file round-trips byte-for-byte. the corpus is otherwise LF, so CRLF
// was previously untested.

describe('line-ending helpers', () => {
	it('detects CRLF when any \\r\\n is present, else LF', () => {
		expect(detectEol('a\r\nb\r\n')).toBe('\r\n');
		expect(detectEol('a\nb\n')).toBe('\n');
		expect(detectEol('no newline at all')).toBe('\n');
	});

	it('toLf normalizes CRLF and lone CR to LF', () => {
		expect(toLf('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
	});

	it('fromLf re-applies the ending', () => {
		expect(fromLf('a\nb\n', '\r\n')).toBe('a\r\nb\r\n');
		expect(fromLf('a\nb\n', '\n')).toBe('a\nb\n');
	});

	it('toLf → fromLf round-trips a uniform-CRLF string byte-for-byte', () => {
		const crlf = '\\section{Intro}\r\nHello world.\r\n';
		expect(fromLf(toLf(crlf), detectEol(crlf))).toBe(crlf);
	});
});

describe('CRLF .tex survives the parse/serialize round-trip', () => {
	// loaded exactly the way the workspace does it: detect ending, normalize to LF, parse,
	// serialize, re-apply the ending
	const bodyLf = '\\section{Intro}\nHello \\textbf{world}.\n\nSecond paragraph.';
	const fileLf = `\\documentclass{article}\n\\begin{document}\n${bodyLf}\n\\end{document}\n`;
	const fileCrlf = fileLf.replace(/\n/g, '\r\n');

	it('an untouched CRLF file re-emits identical bytes', () => {
		const eol = detectEol(fileCrlf);
		expect(eol).toBe('\r\n');
		const lf = toLf(fileCrlf);
		const parsed = parseLatexFile(lf);
		const outLf = serializeLatexFile(parsed, parsed.doc);
		const outDisk = fromLf(outLf, eol);
		// the serialized body isn't guaranteed byte-stable, but its line endings must be uniformly
		// CRLF, never the mixed CRLF/LF that leaked before this fix
		expect(outDisk.includes('\n')).toBe(true);
		expect(/[^\r]\n/.test(outDisk)).toBe(false); // every \n is preceded by \r
	});

	it('the LF-normalized form has no stray carriage returns for offset math', () => {
		expect(toLf(fileCrlf).includes('\r')).toBe(false);
	});
});

describe('a file that mixes CRLF and LF', () => {
	const mixed = 'one\r\ntwo\nthree\r\nfour\nfive\r\n';

	it('an edit in the middle changes only the edited line', () => {
		const eol = detectEol(mixed);
		expect(fromLf(toLf(mixed), eol)).toBe(mixed);
		expect(fromLf(toLf(mixed).replace('four', 'FOUR'), eol)).toBe('one\r\ntwo\nthree\r\nFOUR\r\nfive\r\n');
	});

	it('added lines take the ending most of the file uses', () => {
		const mostlyLf = 'a\nb\r\nc\nd\n';
		expect(fromLf('a\nb\nnew\nc\nd\nend\n', detectEol(mostlyLf))).toBe('a\nb\r\nnew\nc\nd\nend\n');
	});

	it('a file with one kind of ending saves as before', () => {
		for (const eol of ['\r\n', '\n'] as const) {
			const file = ['x', 'y', 'z', ''].join(eol);
			expect(detectEol(file)).toBe(eol);
			expect(fromLf('x\nnew\nz\n', detectEol(file))).toBe(['x', 'new', 'z', ''].join(eol));
		}
	});
});
