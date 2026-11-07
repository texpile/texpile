import { describe, expect, it } from 'vitest';
import { readFootnote, writeFootnote } from '$lib/languages/latex/visual/plugins/footnote/footnoteCommand';

describe('footnoteCommand', () => {
	it('edits the note and the number, and keeps an untouched number as written', () => {
		const source = '\\footnote [7] {A note with $x^{2}$ and \\{ braces.}';
		const footnote = readFootnote(source)!;
		expect(footnote).toEqual({ number: '7', note: 'A note with $x^{2}$ and \\{ braces.' });
		expect(writeFootnote(source, footnote)).toBe(source);
		expect(writeFootnote(source, { ...footnote, note: 'Shorter.' })).toBe('\\footnote [7] {Shorter.}');
		expect(writeFootnote(source, { ...footnote, number: '' })).toBe('\\footnote {A note with $x^{2}$ and \\{ braces.}');
		expect(writeFootnote('\\footnote{Counted.}', { number: '3', note: 'Counted.' })).toBe('\\footnote[3]{Counted.}');
	});

	it('leaves a footnote whose braces do not pair up to its LaTeX', () => {
		expect(readFootnote('\\footnote{one} and \\footnote{two}')).toBeNull();
		expect(readFootnote('\\footnotemark[3]')).toBeNull();
	});
});
