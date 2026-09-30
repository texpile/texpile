// the everyday elements' settings: each read off its call and written back changing only what the setting changed
import { describe, expect, it } from 'vitest';
import { readFootnote, typstFootnoteMarks, writeFootnote } from '$lib/languages/typst/visual/extensions/drawn/footnoteCall';
import { readBreak, writeBreak } from '$lib/languages/typst/visual/extensions/drawn/breakCall';
import { readSpacing, writeSpacing } from '$lib/languages/typst/visual/extensions/drawn/spacingCall';
import { readOutline, writeOutline } from '$lib/languages/typst/visual/extensions/drawn/outlineCall';
import { isTypstLength } from '$lib/languages/typst/visual/extensions/drawn/typstLength';

describe('footnotes', () => {
	it('reads and writes the note, and waits for a bracket to close', () => {
		expect(readFootnote('#footnote[A *note*]')).toEqual({ note: 'A *note*' });
		expect(readFootnote('#footnote(numbering: "*")[x]')).toEqual({ note: 'x' });
		expect(readFootnote('#footnote(<fn>)')).toBeNull();
		expect(writeFootnote('#footnote(numbering: "*")[x]', 'y [z]')).toBe('#footnote(numbering: "*")[y [z]]');
		expect(writeFootnote('#footnote[x]', 'an open [bracket')).toBeNull();
	});

	it('counts every footnote with a note of its own, nested ones too', () => {
		expect(typstFootnoteMarks('#footnote[a]')).toHaveLength(1);
		expect(typstFootnoteMarks('#text(red)[x#footnote[a] y#footnote[b]]')).toHaveLength(2);
		expect(typstFootnoteMarks('#footnote(<fn>)')).toHaveLength(0);
		expect(typstFootnoteMarks('// #footnote[commented]')).toHaveLength(0);
	});
});

describe('breaks', () => {
	it('reads the kind and whether it is weak', () => {
		expect(readBreak('#pagebreak()')).toEqual({ kind: 'page', weak: false });
		expect(readBreak('#pagebreak(weak: true)')).toEqual({ kind: 'page', weak: true });
		expect(readBreak('#pagebreak(to: "odd")')).toEqual({ kind: 'odd', weak: false });
		expect(readBreak('#colbreak()')).toEqual({ kind: 'column', weak: false });
		expect(readBreak('#pagebreak(to: side)')).toBeNull();
		expect(readBreak('#colbreak(to: "odd")')).toBeNull();
	});

	it('writes only what changed', () => {
		expect(writeBreak('#pagebreak()', { kind: 'page', weak: true })).toBe('#pagebreak(weak: true)');
		expect(writeBreak('#pagebreak(weak: true)', { kind: 'page', weak: false })).toBe('#pagebreak()');
		expect(writeBreak('#pagebreak(weak: true)', { kind: 'odd', weak: true })).toBe('#pagebreak(weak: true, to: "odd")');
		expect(writeBreak('#pagebreak(to: "odd")', { kind: 'column', weak: false })).toBe('#colbreak()');
		expect(writeBreak('#colbreak(weak: true)', { kind: 'page', weak: true })).toBe('#pagebreak(weak: true)');
	});
});

describe('spaces', () => {
	it('reads Typst lengths, sums included', () => {
		expect(readSpacing('#v(1em)')).toMatchObject({ vertical: true, amount: '1em', length: { em: 1 }, weak: false });
		expect(readSpacing('#h(1fr)')?.length).toEqual({ fill: true });
		expect(readSpacing('#h(50%)')?.length).toEqual({ share: 0.5 });
		expect(readSpacing('#v(1em + 11pt, weak: true)')).toMatchObject({ length: { em: 2 }, weak: true });
		expect(readSpacing('#v(-2.2pt)')?.length).toEqual({ em: -0.2 });
		// drawn, though no setting can show the amount
		expect(readSpacing('#v(gap)')).toMatchObject({ amount: 'gap', length: null });
		expect(readSpacing('#v(1em, 2em)')).toBeNull();
	});

	it('takes only lengths Typst reads', () => {
		for (const length of ['1em', '2.5cm', '10mm', '1in', '12pt', '50%', '1fr', '1em + 2pt', '-3mm', '.5em'])
			expect(isTypstLength(length)).toBe(true);
		for (const text of ['', '1', '1e', '1em +', 'x', '1px', '1em) + #v(1em', '1em\n']) expect(isTypstLength(text)).toBe(false);
	});

	it('writes the amount and weakness in place', () => {
		expect(writeSpacing('#v(1em)', { amount: '1em + 2pt', weak: false })).toBe('#v(1em + 2pt)');
		expect(writeSpacing('#h(1em)', { amount: '1em', weak: true })).toBe('#h(1em, weak: true)');
		expect(writeSpacing('#v(1em, weak: true)', { amount: '1em', weak: false })).toBe('#v(1em)');
		expect(writeSpacing('#v(1em)', { amount: '1em +', weak: false })).toBeNull();
	});
});

describe('outlines', () => {
	it('reads what it lists, its title and its depth', () => {
		expect(readOutline('#outline()')).toEqual({ shows: 'headings', title: { kind: 'auto' }, depth: null });
		expect(readOutline('#outline(title: [Contents], depth: 2)')).toEqual({
			shows: 'headings',
			title: { kind: 'written', text: 'Contents', quoted: false },
			depth: 2
		});
		expect(readOutline('#outline(title: none, target: figure.where(kind: image))')).toMatchObject({
			shows: 'figures',
			title: { kind: 'none' }
		});
		expect(readOutline('#outline(target: figure.where(kind: table))')?.shows).toBe('tables');
		expect(readOutline('#outline(target: figure.where(kind: raw))')?.shows).toBe('other');
		expect(readOutline('#outline(title: t)')).toBeNull();
	});

	it('writes each setting and keeps the arguments it has none for', () => {
		const source = '#outline(indent: auto, depth: 2)';
		expect(writeOutline(source, { depth: 3 })).toBe('#outline(indent: auto, depth: 3)');
		expect(writeOutline(source, { depth: null })).toBe('#outline(indent: auto)');
		expect(writeOutline(source, { shows: 'figures' })).toBe('#outline(indent: auto, depth: 2, target: figure.where(kind: image))');
		expect(writeOutline('#outline(target: figure.where(kind: image))', { shows: 'headings' })).toBe('#outline()');
		expect(writeOutline('#outline()', { title: { kind: 'written', text: 'Inhalt', quoted: false } })).toBe('#outline(title: [Inhalt])');
		expect(writeOutline('#outline(title: "Inhalt")', { title: { kind: 'written', text: 'Inhalt 2', quoted: true } })).toBe(
			'#outline(title: "Inhalt 2")'
		);
		expect(writeOutline('#outline(title: [Inhalt])', { title: { kind: 'auto' } })).toBe('#outline()');
		expect(writeOutline('#outline()', { title: { kind: 'written', text: 'a [b', quoted: false } })).toBeNull();
	});
});
