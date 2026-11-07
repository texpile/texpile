// @vitest-environment jsdom
// the paper's own definitions drawn as quiet rows, as LaTeX draws its \newcommand lines; a chip that also holds code no
// face draws stays code
import { describe, it, expect } from 'vitest';
import { typstFace } from '$lib/languages/typst/visual/core/walk/typstFace';

function rows(face: ReturnType<typeof typstFace>): string[] {
	return [...(face?.dom.querySelectorAll('.drawn-definition-name') ?? [])].map(
		(name) => `${name.textContent} ${name.nextElementSibling?.textContent} ${name.nextElementSibling?.nextElementSibling?.textContent}`
	);
}

describe('definition faces', () => {
	it('draws lets, a destructuring and a local import as rows, a content value drawn', () => {
		const chip = '#import "blocks.typ": *\n#let ie = [_i.e._,]\n#let paragraph(title) = [*#title* #h(1em)]\n#let (a, b) = (1, 2)';
		const face = typstFace(chip);
		expect(face?.line).toBe(true);
		expect(rows(face)).toEqual(['blocks.typ : *', 'ie := i.e.,', 'paragraph(title) := [*#title* #h(1em)]', '(a, b) := (1, 2)']);
		expect(face?.dom.querySelector('.drawn-definition-body em')?.textContent).toBe('i.e.');
	});

	it('draws a comment among the definitions folded, and leaves a chip with undrawn code as code', () => {
		const face = typstFace('// the theorems\n#let lemma = thmbox("lemma", "Lemma")');
		expect(face?.dom.querySelector('.drawn-definitions')).not.toBeNull();
		expect(face?.dom.textContent).toContain('the theorems');
		expect(typstFace('#let x = 1\n#for i in range(3) [#i]')).toBeNull();
	});
});
