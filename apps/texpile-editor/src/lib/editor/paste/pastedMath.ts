// Math pasted from a LaTeX or Markdown document into a Typst one, or the other way, goes in rewritten
// in the syntax of the document it lands in.
import { convertLatexToTypst, convertTypstToLatex } from 'mathlive';
import type { Schema } from 'prosemirror-model';
import type { MathSyntax } from '$lib/editor/visual/extensions/mathlivebridge/mathFieldFactory';

const MATH = 'span.inline-math, div.block-math';

/** what an editor's math nodes hold, which its schema states on the node type */
export function schemaMathSyntax(schema: Schema): MathSyntax {
	return schema.nodes.inline_math?.spec.mathSyntax === 'typst' ? 'typst' : 'latex';
}

/**
 * Typst math copied with its LaTeX in data-latex: the Typst editor it is copied from has the Typst
 * parser loaded, and the window it is pasted into may never have opened a Typst document
 */
export function addCopiedMathLatex(root: ParentNode): void {
	for (const el of root.querySelectorAll<HTMLElement>(MATH)) {
		if (el.dataset.mathSyntax !== 'typst') continue;
		try {
			el.dataset.latex = convertTypstToLatex(el.textContent ?? '');
		} catch {
			// a paste into LaTeX reads the Typst itself, where it can
		}
	}
}

/** rewrites the math under `root` for `target`; Typst math says so in data-math-syntax, the rest is LaTeX */
export function convertPastedMath(root: ParentNode, target: MathSyntax): void {
	for (const el of root.querySelectorAll<HTMLElement>(MATH)) {
		const source: MathSyntax = el.dataset.mathSyntax === 'typst' ? 'typst' : 'latex';
		if (source === target) continue;
		try {
			const text = el.textContent ?? '';
			el.textContent = target === 'typst' ? convertLatexToTypst(text) : (el.dataset.latex ?? convertTypstToLatex(text));
			el.dataset.mathSyntax = target;
		} catch {
			// no Typst parser loaded yet and no LaTeX copied with it: the math goes in as written
		}
	}
}

export function convertPastedMathHtml(html: string, target: MathSyntax): string {
	if (!/inline-math|block-math/.test(html)) return html;
	const doc = new DOMParser().parseFromString(html, 'text/html');
	convertPastedMath(doc.body, target);
	return doc.body.innerHTML;
}
