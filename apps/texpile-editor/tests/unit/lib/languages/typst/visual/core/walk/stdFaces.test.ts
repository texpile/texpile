// @vitest-environment jsdom
// Typst's own elements, as chips: a call that wraps content drawn as that content in the box or text its arguments make,
// a call that prints nothing as a quiet line, a label, an include and a code block of expressions; each from the data of
// the call's name, never from a list of names
import { describe, it, expect } from 'vitest';
import { typstFace } from '$lib/languages/typst/visual/core/walk/typstFace';
import { typstScopeNow } from '$lib/languages/typst/visual/core/scope/fileScopeNow.svelte';

typstScopeNow.current = null;

function drawn(chip: string): HTMLElement {
	const face = typstFace(chip);
	if (!face) throw new Error(`not drawn: ${chip}`);
	return face.dom;
}

describe('elements that wrap content', () => {
	it('draws a box around a string with its stroke and the words in it', () => {
		const dom = drawn('#box("Intro", stroke: 1pt + red, inset: 3pt)');
		expect(dom.textContent).toBe('Intro');
		expect(dom.style.border).toContain('solid');
		expect(dom.style.padding).toBe('3pt');
	});

	it('draws a quote as its words between quotation marks, and a rect with no content as a box of its size', () => {
		expect(drawn('#quote("Sine experientia")').textContent).toBe('“Sine experientia”');
		const rect = drawn('#rect(width: 0.5 * 8cm, height: 2cm, fill: luma(210))');
		expect(rect.style.width).toContain('calc');
		expect(rect.style.minHeight).toBe('2cm');
	});

	it('draws a styling call given as the body, which the import reads as a mark', () => {
		const dom = drawn('#text(size: 2em, weight: "bold", upper("Annale"))');
		expect(dom.textContent).toBe('Annale');
		expect(dom.innerHTML).toContain('text-transform: uppercase');
	});

	it('draws a call lifted out of a code block, which has no hash', () => {
		expect(drawn('circle(radius: 15pt)').style.borderRadius).toBe('50%');
		expect(drawn('align(center, [x])').style.textAlign).toBe('center');
	});

	it('leaves a call that gives what the drawing would leave out as code', () => {
		expect(typstFace('#rotate(90deg)[x]')).toBeNull();
		expect(typstFace('#figure(rect(), caption: [c])')).toBeNull();
	});
});

describe('quiet lines and notes', () => {
	it('draws a call that prints nothing as a line saying what it does', () => {
		expect(drawn('#counter(page).update(1)').textContent).toBe('Counter - page - update(1)');
		expect(drawn('#metadata("body-start")').textContent).toBe('Metadata - "body-start"');
	});

	it('draws a citation that is not printed as the note that it is in the bibliography', () => {
		expect(drawn('#cite(<analects>, form: none)').textContent).toBe('Also in the bibliography: analects');
		expect(drawn('#cite(label("ads-1"), form: none)').textContent).toContain('ads-1');
	});
});

describe('labels, includes and code blocks', () => {
	it('draws a label standing among the words', () => {
		expect(drawn('<end-front-matter>').textContent).toBe('end-front-matter');
	});

	it('draws an include in a code body as the name of its file', () => {
		expect(drawn('include "../../resources/typst/essawy-table.typ"').textContent).toBe('essawy-table.typ');
	});

	it('draws a code block of expressions as them one after another and leaves one with a rule as code', () => {
		const dom = drawn('#{\n  rect(width: 1cm, height: 1cm)\n  circle(radius: 1cm)\n}');
		expect(dom.children).toHaveLength(2);
		expect(typstFace('#{\n  set page(width: 4cm)\n  circle(radius: 1cm)\n}')).toBeNull();
	});

	it('draws the semicolon after a call and an empty equation as nothing', () => {
		expect(typstFace(';')?.character).toBe(true);
		expect(drawn('$$').textContent).toBe('');
	});
});
