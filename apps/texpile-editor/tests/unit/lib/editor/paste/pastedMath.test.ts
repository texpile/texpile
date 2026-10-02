// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { Fragment } from 'prosemirror-model';
import { configureTypst } from 'mathlive';
import { parseTypstMath } from 'texpile-typst-syntax-wasm';
import { convertPastedMathHtml } from '$lib/editor/paste/pastedMath';
import { texpileClipboardSerializer } from '$lib/editor/paste/texpileCopy';
import { typSchema } from '$lib/languages/typst/visual/schema';

// first, before the parser is set up: a window that has opened no Typst document has none
describe('Typst math pasted into a window that has read no Typst', () => {
	it('goes in as the LaTeX the copy carries', () => {
		const typst = '<p>a <span class="inline-math" data-math-syntax="typst" data-latex="\\frac{\\alpha^2}{2}">alpha^2 / 2</span></p>';
		expect(convertPastedMathHtml(typst, 'latex')).toContain('>\\frac{\\alpha^2}{2}</span>');
	});
});

describe('math pasted between a LaTeX and a Typst document', () => {
	beforeAll(() => configureTypst({ parse: parseTypstMath }));

	it('goes in rewritten in the syntax of the document it lands in', () => {
		const typst = '<p>a <span class="inline-math" data-math-syntax="typst">alpha^2 / 2</span></p>';
		expect(convertPastedMathHtml(typst, 'latex')).toContain('>\\frac{\\alpha^2}{2}</span>');
		expect(convertPastedMathHtml(typst, 'typst')).toBe(typst);
		const latex = '<div class="block-math">\\sqrt{x} \\le \\frac{1}{2}</div>';
		expect(convertPastedMathHtml(latex, 'typst')).toContain('>sqrt(x) &lt;= 1/2</div>');
	});

	it('is copied from a Typst document with its LaTeX', () => {
		const math = typSchema.nodes.inline_math.create(null, typSchema.text('alpha^2 / 2'));
		const copy = texpileClipboardSerializer(typSchema).serializeFragment(Fragment.from(typSchema.nodes.paragraph.create(null, math)));
		expect((copy.firstChild as HTMLElement).querySelector('.inline-math')?.getAttribute('data-latex')).toBe('\\frac{\\alpha^2}{2}');
	});
});
