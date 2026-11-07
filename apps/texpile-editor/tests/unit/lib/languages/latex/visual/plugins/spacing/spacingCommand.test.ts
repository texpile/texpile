import { describe, expect, it } from 'vitest';
import { readSpacing, writeSpacing } from '$lib/languages/latex/visual/plugins/spacing/spacingCommand';

describe('spacingCommand', () => {
	it('writes a chip back byte for byte when nothing changed', () => {
		for (const source of ['\\vspace{1.5cm}', '\\vspace*{-0.63em} ', '\\hspace{.5in}', ' \\bigskip', '\\quad{}', '\\hfill\n', '\\,']) {
			expect(writeSpacing(readSpacing(source)!)).toBe(source);
		}
	});

	it('turns a named skip into a length and back', () => {
		const skip = readSpacing('\\bigskip\n')!;
		expect(writeSpacing({ ...skip, name: 'vspace', amount: '12', unit: 'pt', star: true })).toBe('\\vspace*{12pt}\n');
		const length = readSpacing('\\hspace{2em}')!;
		expect(writeSpacing({ ...length, name: 'qquad', amount: '', unit: '', star: false })).toBe('\\qquad');
	});

	it('leaves anything but one plain command to the LaTeX field', () => {
		for (const source of ['\\vspace{\\baselineskip}', '\\vspace{2mm plus 1mm}', '\\medskip {\\bf (1)}', '\\vspace{1cm}\\clearpage']) {
			expect(readSpacing(source)).toBeNull();
		}
	});
});
