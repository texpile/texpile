// table floats regenerated with things the source never had (an empty caption, \centering, the
// caption moved above the tabular, |c| for every \multicolumn, \small for \footnotesize notes)
// or without things it did (a nested environment in a cell, a second tabular, \\[2ex] on a row,
// a longtable's column spec, a short caption)
import { describe, it, expect } from 'vitest';
import * as LatexParser from '$lib/languages/latex/parser/latexParser';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

const rt = (s: string) => serializeToLatex(LatexParser.latexToProseMirror(s).doc);
const count = (s: string, needle: string) => s.split(needle).length - 1;

describe('table cells', () => {
	it('keep a nested environment (27)', () => {
		const out = rt('\\begin{tabular}{ll}\na & \\begin{itemize}\\item x\\end{itemize} \\\\\n\\end{tabular}');
		expect(out).toContain('\\begin{itemize}');
		expect(out).toContain('\\item x');
	});

	it('keep the \\multicolumn alignment as written (37)', () => {
		const out = rt('\\begin{tabular}{lll}\n\\multicolumn{2}{r}{merged} & c \\\\\n\\end{tabular}');
		expect(out).toContain('\\multicolumn{2}{r}{merged}');
		expect(out).not.toContain('|c|');
	});

	it('keep a row break argument (44)', () => {
		const out = rt('\\begin{tabular}{ll}\na & b \\\\[2ex]\nc & d \\\\\n\\end{tabular}');
		expect(out).toContain('\\\\[2ex]');
	});
});

describe('a tabular', () => {
	// [t] and [b] set where the tabular sits against the line, [l] a longtable's alignment
	it('keeps its position argument', () => {
		expect(rt('\\begin{tabular}[t]{ll}\na & b \\\\\n\\end{tabular}')).toContain('\\begin{tabular}[t]{ll}');
		expect(rt('\\begin{longtable}[l]{ll}\na & b \\\\\n\\end{longtable}')).toContain('\\begin{longtable}[l]{ll}');
	});
});

describe('table floats', () => {
	// a \label ahead of \caption binds to the last counter stepped instead of the table, so \ref
	// resolves to a list item or a section with no undefined-reference warning to show for it
	it('keeps \\label after \\caption when the source put the caption below the tabular', () => {
		const out = rt('\\begin{table}\n\\begin{tabular}{l}\na \\\\\n\\end{tabular}\n\\caption{Cap}\n\\label{tab:x}\n\\end{table}\n\nedited');
		expect(out.indexOf('\\label{tab:x}')).toBeGreaterThan(out.indexOf('\\caption{Cap}'));
	});

	it('keeps \\label after \\caption when the caption sits above the tabular', () => {
		const out = rt('\\begin{table}\n\\caption{Cap}\n\\label{tab:y}\n\\begin{tabular}{l}\na \\\\\n\\end{tabular}\n\\end{table}');
		expect(out.indexOf('\\label{tab:y}')).toBeGreaterThan(out.indexOf('\\caption{Cap}'));
	});

	it('a second tabular is not dropped (28)', () => {
		const out = rt(
			'\\begin{table}\n\\caption{Two}\n\\begin{tabular}{l}\na \\\\\n\\end{tabular}\n\\begin{tabular}{l}\nb \\\\\n\\end{tabular}\n\\end{table}'
		);
		expect(count(out, '\\begin{tabular}')).toBe(2);
		expect(out).toContain('\\caption{Two}');
	});

	it('a longtable keeps its column spec (29)', () => {
		const out = rt('\\begin{longtable}{ll}\na & b \\\\\n\\end{longtable}');
		expect(out).toContain('\\begin{longtable}{ll}');
		expect(out).not.toContain('tabularx');
	});

	it('a caption-less table gains no caption and no \\centering (38)', () => {
		const out = rt('\\begin{table}\n\\begin{tabular}{l}\na \\\\\n\\end{tabular}\n\\end{table}');
		expect(out).not.toContain('\\caption');
		expect(out).not.toContain('\\centering');
	});

	it('a caption below the tabular stays below, and \\centering stays (38)', () => {
		const out = rt('\\begin{table}\n\\centering\n\\begin{tabular}{l}\na \\\\\n\\end{tabular}\n\\caption{Below}\n\\end{table}');
		expect(out).toContain('\\centering');
		expect(out.indexOf('\\caption{Below}')).toBeGreaterThan(out.indexOf('\\end{tabular}'));
	});

	it('a short caption survives (40)', () => {
		const out = rt('\\begin{table}\n\\caption[Short]{Long caption}\n\\begin{tabular}{l}\na \\\\\n\\end{tabular}\n\\end{table}');
		expect(out).toContain('\\caption[Short]{Long caption}');
	});

	it('notes keep their own size switch (54)', () => {
		const out = rt('\\begin{table}\n\\begin{tabular}{l}\na \\\\\n\\end{tabular}\n{\\footnotesize Source: us.}\n\\end{table}');
		expect(out).toContain('{\\footnotesize Source: us.}');
		expect(out).not.toContain('{\\small');
	});

	it('notes after a skip are still notes, so a second save keeps them', () => {
		const once = rt('\\begin{table}\n\\begin{tabular}{l}\na \\\\\n\\end{tabular}\n\\medskip\n{\\small Source: us.}\n\\end{table}');
		expect(once).toContain('Source: us.');
		expect(rt(once)).toBe(once);
	});
});
