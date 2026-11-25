// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_CLASS, renderStaticMath, typesetStaticMathIn } from '$lib/editor/visual/extensions/mathlivebridge/mathStatic';

describe('static math', () => {
	it('typesets the formulas in DOM drawn with the paper at once, sized by what they draw', () => {
		const title = document.createElement('div');
		title.append('On ', renderStaticMath('\\mathbb{Z}_p', false), '-extensions and ', renderStaticMath('\\sum_{n\\ge 1} n^{-s}', false));
		const formulas = [...title.querySelectorAll<HTMLElement>(`.${PLACEHOLDER_CLASS}`)];
		expect(formulas.map((math) => math.style.width === '')).toEqual([false, false]);
		typesetStaticMathIn(title);
		expect(formulas.map((math) => [math.style.width, math.style.height, math.querySelector('.ML__latex') !== null])).toEqual([
			['', '', true],
			['', '', true]
		]);
	});
});
