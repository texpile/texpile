import { describe, expect, it } from 'vitest';
import { namedArg, readTypstCall, rewrittenCall, type CallChange } from '$lib/languages/typst/visual/extensions/drawn/typstCall';

function rewrite(source: string, change: CallChange): string {
	const call = readTypstCall(source);
	if (!call) throw new Error(`not a call: ${source}`);
	return rewrittenCall(call, change);
}

describe('readTypstCall', () => {
	it('reads a call, a set rule and their arguments where they stand', () => {
		const call = readTypstCall('#set page(paper: "a4", margin: (x: 2cm), numbering: "1")')!;
		expect(call.form).toBe('set');
		expect(call.name).toBe('page');
		expect(call.args.map((arg) => [arg.name, arg.kind, arg.value])).toEqual([
			['paper', 'Str', '"a4"'],
			['margin', 'Dict', '(x: 2cm)'],
			['numbering', 'Str', '"1"']
		]);
		const footnote = readTypstCall('#footnote(numbering: "*")[A *note*]')!;
		expect(footnote.name).toBe('footnote');
		expect(footnote.bodies.map((body) => body.value)).toEqual(['[A *note*]']);
		expect(namedArg(footnote, 'numbering')?.value).toBe('"*"');
		expect(readTypstCall('#set math.equation(numbering: "(1)")')?.name).toBe('math.equation');
	});

	it('reads nothing a setting could not hold exactly', () => {
		expect(readTypstCall('#set text(lang: "de") if german')).toBeNull();
		expect(readTypstCall('#set par(..args)')).toBeNull();
		expect(readTypstCall('#set page(paper: "a4"')).toBeNull();
		expect(readTypstCall('#v(1em) #v(2em)')).toBeNull();
		expect(readTypstCall('#v(1em);')).toBeNull();
		expect(readTypstCall('#pagebreak(weak: true, weak: false)')).toBeNull();
		expect(readTypstCall('#outline')).toBeNull();
		expect(readTypstCall('text #v(1em)')).toBeNull();
	});
});

describe('rewrittenCall', () => {
	it('changes only the value it sets', () => {
		expect(rewrite('#set page(paper: "a4",   margin: 2cm)', { named: { paper: '"a5"' } })).toBe('#set page(paper: "a5",   margin: 2cm)');
		expect(rewrite('#v(1em, weak: true)', { positional: { 0: '2em' } })).toBe('#v(2em, weak: true)');
		expect(rewrite('#footnote[old]', { body: 'new *one*' })).toBe('#footnote[new *one*]');
		expect(rewrite('#pagebreak()', { name: 'colbreak' })).toBe('#colbreak()');
	});

	it('takes an argument out with its comma, or with its line when it has one to itself', () => {
		expect(rewrite('#set page(a: 1, b: 2, c: 3)', { named: { b: null } })).toBe('#set page(a: 1, c: 3)');
		expect(rewrite('#set page(a: 1, b: 2)', { named: { b: null } })).toBe('#set page(a: 1)');
		expect(rewrite('#set page(a: 1)', { named: { a: null } })).toBe('#set page()');
		expect(rewrite('#set page(\n  a: 1, // first\n  b: 2,\n)', { named: { a: null } })).toBe('#set page(\n  b: 2,\n)');
		expect(rewrite('#set page(\n  a: 1,\n  b: 2\n)', { named: { b: null } })).toBe('#set page(\n  a: 1,\n)');
	});

	it('takes out neighboring arguments together, the last one included', () => {
		expect(rewrite('#set page(a: 1, b: 2)', { named: { a: null, b: null } })).toBe('#set page()');
		expect(rewrite('#set page(x: 0, a: 1, b: 2)', { named: { a: null, b: null } })).toBe('#set page(x: 0)');
	});

	it('adds an argument laid out as the others are', () => {
		expect(rewrite('#set page()', { named: { paper: '"a4"' } })).toBe('#set page(paper: "a4")');
		expect(rewrite('#set page(paper: "a4")', { named: { margin: '2cm' } })).toBe('#set page(paper: "a4", margin: 2cm)');
		expect(rewrite('#set page(\n  paper: "a4",\n)', { named: { margin: '2cm' } })).toBe('#set page(\n  paper: "a4",\n  margin: 2cm,\n)');
		expect(rewrite('#set page(\n\tpaper: "a4"\n)', { named: { margin: '2cm' } })).toBe('#set page(\n\tpaper: "a4",\n\tmargin: 2cm,\n)');
		expect(rewrite('#footnote[x]', { named: { numbering: '"*"' } })).toBe('#footnote(numbering: "*")[x]');
	});

	it('adds an argument after the ones that stay when another is taken out', () => {
		expect(rewrite('#pagebreak(to: "odd")', { named: { to: null, weak: 'true' } })).toBe('#pagebreak(weak: true)');
		expect(rewrite('#set page(\n  a: 1,\n  b: 2\n)', { named: { b: null, c: '3' } })).toBe('#set page(\n  a: 1,\n  c: 3,\n)');
	});

	it('leaves the source as it was when nothing changes', () => {
		const source = '#set text(font: "Libertinus Serif",size:11pt)';
		expect(rewrite(source, { named: { size: '11pt' } })).toBe(source);
	});
});
