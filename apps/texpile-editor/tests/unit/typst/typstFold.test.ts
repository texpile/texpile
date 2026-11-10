// @vitest-environment jsdom
// Folding is not a free consequence of having a syntax tree — it needs foldNodeProp on the node
// types. These check the ranges are the ones a reader would expect.
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { foldable } from '@codemirror/language';
import { typstLanguage } from '$lib/languages/typst/source/typstLanguage';
import { typstFoldKinds } from '$lib/languages/typst/intellisense/typstFoldKinds';

const state = (doc: string) => EditorState.create({ doc, extensions: [typstLanguage()] });

/** the fold range offered on the line containing `needle` */
function foldAt(doc: string, needle: string) {
	const st = state(doc);
	const line = st.doc.lineAt(doc.indexOf(needle));
	return foldable(st, line.from, line.to);
}

describe('typst folding', () => {
	it('folds a code block between its braces', () => {
		const doc = '#{\n  let x = 1\n  x + 1\n}\n';
		const range = foldAt(doc, '#{');
		expect(range).toBeTruthy();
		// the braces stay visible; everything between them collapses
		expect(doc.slice(range!.from, range!.to)).toBe('\n  let x = 1\n  x + 1\n');
	});

	it('folds a content block', () => {
		const doc = '#let a = [\n  hello\n]\n';
		const range = foldAt(doc, '[');
		expect(range).toBeTruthy();
		expect(doc.slice(range!.from, range!.to)).toContain('hello');
	});

	it('folds a heading down to the end of its section', () => {
		const doc = '= One\n\nbody of one\n\n= Two\n\nbody of two\n';
		const range = foldAt(doc, '= One');
		expect(range).toBeTruthy();
		const folded = doc.slice(range!.from, range!.to);
		expect(folded).toContain('body of one');
		// the next same-level heading ends the section, so it must NOT be swallowed
		expect(folded).not.toContain('= Two');
	});

	it('folds a subsection into its parent heading', () => {
		const doc = '= Top\n\nintro\n\n== Sub\n\ndetail\n\n= Next\n';
		const range = foldAt(doc, '= Top');
		expect(range).toBeTruthy();
		const folded = doc.slice(range!.from, range!.to);
		expect(folded).toContain('== Sub');
		expect(folded).toContain('detail');
		expect(folded).not.toContain('= Next');
	});

	it('offers nothing on a heading with no body', () => {
		expect(foldAt('= Alone\n', '= Alone')).toBeNull();
	});

	it('offers nothing for an unclosed block', () => {
		// mid-typing: a fold range here would run to the end of the document
		expect(foldAt('#{\n  let x = 1\n', '#{')).toBeNull();
	});
});

describe('typst folds by kind', () => {
	it('sorts a figure call, a display equation and another call', () => {
		const doc = '#figure(\n  image("a.png"),\n  caption: [A],\n)\n\n$ x\n  = 1 $\n\n#box(\n  [b],\n)\n';
		const st = state(doc);
		expect(typstFoldKinds(st).map((f) => `${st.doc.lineAt(f.from).text} ${f.kind}`)).toEqual([
			'#figure( float',
			'$ x equation',
			'#box( environment'
		]);
	});
});
