import { describe, it, expect } from 'vitest';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { numberedElementsOf } from '$lib/languages/typst/visual/extensions/numbers/numberedElements';
import { matchPrintedNumbers } from '$lib/languages/typst/visual/extensions/numbers/matchPrinted';
import type { TypstPrintedNumber } from '$lib/stores/typstPrintedNumbers';

type Given = Partial<TypstPrintedNumber> & Pick<TypstPrintedNumber, 'kind' | 'number'>;
const printed = (...items: Given[]): TypstPrintedNumber[] => items.map((i) => ({ label: null, text: '', page: 1, ...i }));
const heading = (number: string | null, text: string, label: string | null = null, level = 1): Given => ({
	kind: 'heading',
	number,
	text,
	label,
	level
});
const equation = (number: string | null, label: string | null = null): Given => ({ kind: 'equation', number, label });
const figure = (number: string | null, text: string, figureKind = 'image', label: string | null = null): Given => ({
	kind: 'figure',
	number,
	text,
	figureKind,
	label
});

function numbersOf(src: string, list: TypstPrintedNumber[], whole = true): [string, string | null][] {
	const { doc } = typstToProseMirror(src);
	const elements = numberedElementsOf(doc);
	const numbers = matchPrintedNumbers(elements, list, whole);
	return elements.map((e, i) => [e.label ?? (e.text || e.kind), numbers[i]]);
}

describe('which printed number an element takes', () => {
	it('takes the number of its label, whatever its words are now', () => {
		const src = '= Renamed since <intro>\n\n= Second <second>\n';
		const list = printed(heading('1', 'Introduction', 'intro'), heading('2', 'Second', 'second'));
		expect(numbersOf(src, list, false)).toEqual([
			['intro', '1'],
			['second', '2']
		]);
	});

	it('pairs headings by title, a renamed one between two matches by count, and gives a new one no number', () => {
		const src = '= One\n\n= Two now\n\n= Three\n\n== Brand new\n\n= Four\n';
		const list = printed(heading('1', 'One'), heading('2', 'Two'), heading('3', 'Three'), heading('4', 'Four'));
		expect(numbersOf(src, list)).toEqual([
			['One', '1'],
			['Two now', '2'],
			['Three', '3'],
			['Brand new', null],
			['Four', '4']
		]);
	});

	it('numbers equations between two labeled neighbors by order only when both sides hold as many', () => {
		const src = '= A <a>\n\n$ x $\n\n$ y $\n\n= B <b>\n\n$ z $\n\n= C <c>\n';
		const list = printed(
			heading('1', 'A', 'a'),
			equation('(1)'),
			equation('(2)'),
			heading('2', 'B', 'b'),
			equation('(3)'),
			equation('(4)'),
			heading('3', 'C', 'c')
		);
		expect(numbersOf(src, list).map(([, n]) => n)).toEqual(['1', '(1)', '(2)', '2', null, '3']);
		expect(
			numbersOf(
				src,
				list.filter((p) => p.number !== '(4)')
			).map(([, n]) => n)
		).toEqual(['1', '(1)', '(2)', '2', '(3)', '3']);
	});

	it('numbers an included chapter from the middle of a longer list by what is unique, and leaves the stretches past its neighbors', () => {
		const src = '= Methods\n\n$ x $\n\n= Setup <setup>\n\n$ y $\n';
		const list = printed(
			heading('1', 'Introduction'),
			equation('(1)'),
			heading('2', 'Methods'),
			equation('(2)'),
			heading('3', 'Setup', 'setup'),
			equation('(3)'),
			heading('4', 'Results'),
			equation('(4)')
		);
		expect(numbersOf(src, list, false).map(([, n]) => n)).toEqual(['2', '(2)', '3', null]);
		// the same title in two files is not told apart
		const twice = printed(heading('1', 'Methods'), heading('4', 'Methods'));
		expect(numbersOf('= Methods\n', twice, false)).toEqual([['Methods', null]]);
	});

	it('shows no number for an element printed without one, and reads a custom figure kind', () => {
		const src = [
			'= Intro <i>',
			'#figure(image("a.png"), caption: [Plot])',
			'#figure(table(columns: 1, [a]), caption: [Plot])',
			'#figure([x], kind: "algorithm", supplement: [Algorithm], caption: [Sorting])',
			'#figure([x], kind: "algorithm", caption: [Sorting later])',
			''
		].join('\n\n');
		const list = printed(
			heading(null, 'Intro', 'i'),
			figure('1', 'Plot', 'image'),
			figure('1', 'Plot', 'table'),
			figure('1', 'Sorting', 'algorithm'),
			figure('2', 'Sorting later', 'algorithm')
		);
		expect(numbersOf(src, list).map(([, n]) => n)).toEqual([null, '1', '1', '1', '2']);
	});
});
