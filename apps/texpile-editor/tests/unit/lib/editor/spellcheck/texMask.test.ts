import { describe, expect, it } from 'vitest';
import { maskTex, overlapsMask } from '$lib/editor/extensions/spellcheck/texMask';

// The LaTeX masker feeding harper in source mode: markup becomes spaces (offsets preserved),
// prose (including content-command arguments) stays. Mirrors upstream harper-tex's Masker.

describe('maskTex', () => {
	it('masks markup, keeps prose, preserves every offset', () => {
		const src = [
			'\\documentclass[12pt]{article}',
			'\\begin{document}',
			'\\section{Energy and Environment}',
			'Some prose with \\textbf{bold words} and math $x^2 + y$ inline.',
			'% a commented line',
			'\\begin{equation}',
			'E = mc^2',
			'\\end{equation}',
			'\\begin{tabular}{ll}',
			'a & b \\\\',
			'\\end{tabular}',
			'A \\verb|raw#code| tie~here.',
			'\\end{document}'
		].join('\n');
		const { text, spans } = maskTex(src);
		expect(text.length).toBe(src.length);
		// prose survives at its original offsets
		for (const keep of ['Energy and Environment', 'Some prose with ', 'bold words', ' and math ', 'here.']) {
			expect(text.indexOf(keep)).toBe(src.indexOf(keep));
		}
		// markup, math, comments, verbatim, col specs, ties are gone
		for (const gone of ['\\textbf', 'x^2', 'commented', 'mc^2', '{ll}', 'a & b', 'raw#code', '~', 'documentclass', '12pt']) {
			expect(text).not.toContain(gone);
		}
		// inside a span everything is blanked; outside, the source is untouched
		for (let i = 0; i < src.length; i++) {
			expect(text[i]).toBe(overlapsMask(spans, i, i + 1) ? ' ' : src[i]);
		}
	});

	it('finds a real misspelling through harper at source offsets, none inside markup', async () => {
		const { LocalLinter, binaryInlined } = await import('harper.js');
		const linter = new LocalLinter({ binary: binaryInlined });
		const src = 'The\n  \\textbf{misteak} is visible, $misteak + 1$ and \\cite{misteak} are not.';
		const { text, spans } = maskTex(src);
		const lints = await linter.lint(text);
		const surviving = lints
			.map((l) => l.span())
			.filter((s) => !overlapsMask(spans, s.start, s.end))
			.map((s) => src.slice(s.start, s.end));
		expect(surviving).toEqual(['misteak']);
		// and that one sits exactly on the \textbf argument in the SOURCE
		const s = lints.map((l) => l.span()).find((sp) => !overlapsMask(spans, sp.start, sp.end))!;
		expect(s.start).toBe(src.indexOf('misteak'));
	}, 30000);
});
