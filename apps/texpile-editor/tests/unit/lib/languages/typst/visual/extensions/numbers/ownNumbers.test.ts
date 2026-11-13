import { describe, it, expect } from 'vitest';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { ownNumbersOf } from '$lib/languages/typst/visual/extensions/numbers/ownNumbers';
import { typstRefFace } from '$lib/languages/typst/visual/plugins/ref/node/typstRefFace';

const count = (src: string) => ownNumbersOf(typstToProseMirror(src).doc);
const numbers = (src: string) => count(src)?.labels ?? null;

const DOC = `#set heading(numbering: "1.")

= Intro <intro>

== Deep <deep>

See @tbl.

#figure(table(columns: 2, [a], [b]), caption: [T]) <tbl>

#figure(image("a.png"), caption: [F]) <fig>
`;

describe('what a reference to a label prints', () => {
	it('counts tables, figures and headings by the set rules and prints them as Typst does', () => {
		const labels = numbers(DOC)!;
		expect(labels.get('tbl')).toEqual({ supplement: 'Table', number: '1' });
		expect(labels.get('fig')).toEqual({ supplement: 'Figure', number: '1' });
		expect(labels.get('intro')).toEqual({ supplement: 'Section', number: '1' });
		expect(labels.get('deep')).toEqual({ supplement: 'Section', number: '1.1' });
		expect(typstRefFace({ target: 'tbl', supplement: null }, null, labels).text).toBe('Table 1');
		expect(typstRefFace({ target: 'tbl', supplement: 'Tab.' }, null, labels).text).toBe('Tab. 1');
	});

	it('gives no number where the document leaves it to code the editor cannot read', () => {
		expect(numbers(`#show: template.with(title: "T")\n\n${DOC}`)).toBeNull();
		expect(numbers(`#set text(lang: "de")\n\n${DOC}`)).toBeNull();
		const labels = numbers(`#figure(rect(), caption: [R])\n\n${DOC}`)!;
		expect(labels.get('fig')).toBeNull();
		expect(typstRefFace({ target: 'fig', supplement: null }, null, labels).text).toBe('@fig');
	});

	// before any compile the heading and the equation show these, so they are written as Typst prints them
	it('draws a heading and an equation as the element prints its number, and stops at what another file counts', () => {
		const src =
			'#set heading(numbering: "1.")\n#set math.equation(numbering: "(1)")\n\n= One\n\n== Deep\n\n$ x $\n\n#heading(numbering: none)[Plain]\n\n= Two\n';
		const doc = typstToProseMirror(src).doc;
		const drawn = [...ownNumbersOf(doc)!.drawn].map(([pos, number]) => `${doc.nodeAt(pos)!.textContent} ${number}`);
		expect(drawn).toEqual(['One 1.', 'Deep 1.1.', 'x (1)', 'Two 2.']);
		// the supplement words are German here, the numbers are the same
		expect(count(`#set text(lang: "de")\n\n${src}`)).toMatchObject({ labels: null });
		expect(count(`#set text(lang: "de")\n\n${src}`)!.drawn.size).toBe(4);
		const split = typstToProseMirror('#set heading(numbering: "1.")\n\n= One\n\n#include "ch.typ"\n\n= Two\n').doc;
		expect([...ownNumbersOf(split)!.drawn.values()]).toEqual(['1.']);
	});
});
