import { describe, it, expect } from 'vitest';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { collectLabelNumbers } from '$lib/languages/typst/visual/plugins/ref/node/labelNumbers';
import { typstRefFace } from '$lib/languages/typst/visual/plugins/ref/node/typstRefFace';

const numbers = (src: string) => collectLabelNumbers(typstToProseMirror(src).doc);

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
});
