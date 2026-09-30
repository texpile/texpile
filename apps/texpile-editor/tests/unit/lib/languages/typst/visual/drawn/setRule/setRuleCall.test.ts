import { describe, expect, it } from 'vitest';
import {
	fieldValue,
	otherArguments,
	readSetRule,
	writeSetField,
	type SetRule
} from '$lib/languages/typst/visual/extensions/drawn/setRule/setRuleCall';
import { setRuleSummary } from '$lib/languages/typst/visual/extensions/drawn/setRule/setRuleSummary';

function rule(source: string): SetRule {
	const read = readSetRule(source);
	if (!read) throw new Error(`not a set rule: ${source}`);
	return read;
}

function field(read: SetRule, name: string) {
	const found = read.fields.find((f) => f.name === name);
	if (!found) throw new Error(`no field ${name}`);
	return found;
}

function write(source: string, name: string, text: string): string | null {
	const read = rule(source);
	return writeSetField(read, field(read, name), text);
}

describe('reading a set rule', () => {
	it('reads the six rules the editor draws, and no other', () => {
		for (const target of ['page', 'text', 'par', 'heading', 'document', 'math.equation'])
			expect(readSetRule(`#set ${target}()`)?.target).toBe(target);
		expect(readSetRule('#set table(stroke: none)')).toBeNull();
		expect(readSetRule('#set text(lang: "de") if german')).toBeNull();
		expect(readSetRule('#set page(..margins)')).toBeNull();
	});

	it('shows each value as its field does, and one it cannot as its Typst', () => {
		const page = rule('#set page(paper: "a4", margin: (x: 2cm, y: 3cm), numbering: none, fill: red)');
		expect(fieldValue(page, field(page, 'paper'))).toEqual({ text: 'a4', code: false, given: true });
		expect(fieldValue(page, field(page, 'margin'))).toEqual({ text: '(x: 2cm, y: 3cm)', code: true, given: true });
		expect(fieldValue(page, field(page, 'numbering'))).toEqual({ text: '', code: false, given: true });
		expect(fieldValue(page, field(page, 'columns'))).toEqual({ text: '', code: false, given: false });
		expect(otherArguments(page)).toEqual(['fill']);
		const document = rule('#set document(title: [My *Title*], author: ("Ada", "Grace"))');
		expect(fieldValue(document, field(document, 'title')).text).toBe('My *Title*');
		expect(fieldValue(document, field(document, 'author')).text).toBe('Ada, Grace');
	});

	it('shows a list of names one of which holds a comma as its Typst, as the field’s commas part the names', () => {
		const source = '#set document(author: ("Doe, John",))';
		const document = rule(source);
		expect(fieldValue(document, field(document, 'author'))).toEqual({ text: '("Doe, John",)', code: true, given: true });
		expect(write(source, 'author', '("Doe, John", "Roe, Jane")')).toBe('#set document(author: ("Doe, John", "Roe, Jane"))');
	});

	it('sums a rule up in a few words', () => {
		expect(setRuleSummary(rule('#set page(paper: "a4", margin: 2.5cm)'))).toEqual(['Page', 'A4', '2.5cm margins']);
		expect(setRuleSummary(rule('#set page(paper: "us-letter", columns: 2)'))).toEqual(['Page', 'US Letter', '2 columns']);
		expect(setRuleSummary(rule('#set text(font: "Libertinus Serif", size: 11pt, lang: "en")'))).toEqual([
			'Text',
			'Libertinus Serif',
			'11pt',
			'en'
		]);
		expect(setRuleSummary(rule('#set par(justify: true, leading: 0.8em)'))).toEqual(['Paragraphs', 'justified', 'leading 0.8em']);
		expect(setRuleSummary(rule('#set heading(numbering: "1.1")'))).toEqual(['Headings', 'numbered 1.1']);
		expect(setRuleSummary(rule('#set heading(numbering: none)'))).toEqual(['Headings', 'unnumbered']);
		expect(setRuleSummary(rule('#set math.equation(numbering: "(1)")'))).toEqual(['Equations', 'numbered (1)']);
		expect(setRuleSummary(rule('#set page(margin: (x: 1cm))'))).toEqual(['Page']);
	});
});

describe('writing a field', () => {
	it('changes only its own argument, every other byte kept', () => {
		const source = '#set page(\n  paper: "a4", // A4 for print\n  margin: (x: 2cm, y: 3cm),\n  fill: rgb("#fffbe6"),\n)';
		expect(write(source, 'paper', 'a5')).toBe(source.replace('"a4"', '"a5"'));
		expect(write(source, 'margin', '(x: 1cm, y: 3cm)')).toBe(source.replace('(x: 2cm, y: 3cm)', '(x: 1cm, y: 3cm)'));
		expect(write(source, 'columns', '2')).toBe(source.replace('  fill: rgb("#fffbe6"),\n', '  fill: rgb("#fffbe6"),\n  columns: 2,\n'));
		expect(write(source, 'paper', '')).toBe('#set page(\n  margin: (x: 2cm, y: 3cm),\n  fill: rgb("#fffbe6"),\n)');
	});

	it('writes each kind of value the way Typst reads it', () => {
		expect(write('#set text()', 'font', 'New Computer Modern')).toBe('#set text(font: "New Computer Modern")');
		expect(write('#set text(size: 11pt)', 'size', '10pt + 1pt')).toBe('#set text(size: 10pt + 1pt)');
		expect(write('#set par()', 'justify', 'true')).toBe('#set par(justify: true)');
		expect(write('#set par(justify: true)', 'justify', 'false')).toBe('#set par(justify: false)');
		expect(write('#set heading(numbering: none)', 'numbering', '1.1')).toBe('#set heading(numbering: "1.1")');
		expect(write('#set document(title: [Old])', 'title', 'New *one*')).toBe('#set document(title: [New *one*])');
		expect(write('#set document()', 'title', 'A "quoted" title')).toBe('#set document(title: "A \\"quoted\\" title")');
		expect(write('#set document(author: ("Ada",))', 'author', 'Ada, Grace')).toBe('#set document(author: ("Ada", "Grace"))');
		expect(write('#set document(author: "Ada")', 'author', 'Ada, Grace')).toBe('#set document(author: "Ada, Grace")');
	});

	it('waits while the text is not a value yet', () => {
		expect(write('#set text(size: 11pt)', 'size', '11')).toBeNull();
		expect(write('#set text(size: 11pt)', 'size', '11pt +')).toBeNull();
		expect(write('#set page()', 'columns', 'two')).toBeNull();
		expect(write('#set document(title: [x])', 'title', 'open [')).toBeNull();
		expect(write('#set document(author: ("Ada",))', 'author', 'Ada, ')).toBeNull();
		expect(write('#set page(margin: (x: 2cm))', 'margin', '(x: 2cm')).toBeNull();
	});
});
