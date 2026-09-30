import { describe, expect, it } from 'vitest';
import type { Node } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { latexToProseMirror } from '$lib/languages/latex/parser/converter';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { chipReplacement } from '$lib/editor/visual/extensions/drawnChips/chipReparse';

const block = (text: string) => schema.node('raw_latex', null, text ? [schema.text(text)] : []);
const inline = (text: string) => schema.node('inline_latex', null, [schema.text(text)]);
const shape = (nodes: Node[] | null) => nodes?.map((n) => `${n.type.name}: ${n.textContent}`) ?? null;

describe('chipReplacement', () => {
	it('lets words typed into a block chip out as a paragraph between the commands', () => {
		const edited = '\\clearpage\n\nokay this is cool\n\n\\appendix';
		expect(shape(chipReplacement(latexToProseMirror(edited).doc, block(edited), true))).toEqual([
			'raw_latex: \\clearpage',
			'paragraph: okay this is cool',
			// a paragraph holding the \appendix chip, drawn as its divider all the same
			'paragraph: \\appendix'
		]);
	});

	it('lets words typed after an inline chip out into its paragraph', () => {
		const edited = '\\footnote{a note} and more words';
		expect(shape(chipReplacement(latexToProseMirror(edited).doc, inline(edited), false))).toEqual([
			'inline_latex: \\footnote{a note}',
			'text:  and more words'
		]);
	});

	it('keeps a chip that still reads as itself, and leaves an emptied one an empty line', () => {
		expect(chipReplacement(latexToProseMirror('\\vspace{3cm}').doc, inline('\\vspace{3cm}'), false)).toBeNull();
		expect(chipReplacement(latexToProseMirror('% one\n% two').doc, block('% one\n% two'), true)).toBeNull();
		expect(shape(chipReplacement(latexToProseMirror('').doc, block(''), true))).toEqual(['paragraph: ']);
	});

	it('does the same for a Typst comment island', () => {
		const edited = '// a comment\n\nnew words\n\n// another';
		const chip = typSchema.node('raw_latex', null, [typSchema.text(edited)]);
		expect(shape(chipReplacement(typstToProseMirror(edited).doc, chip, true))?.some((n) => n === 'paragraph: new words')).toBe(true);
	});
});
