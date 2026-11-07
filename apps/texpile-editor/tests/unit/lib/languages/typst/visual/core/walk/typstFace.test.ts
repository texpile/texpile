// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Decoration } from 'prosemirror-view';
import { EditorState } from 'prosemirror-state';
import { typstFace } from '$lib/languages/typst/visual/core/walk/typstFace';
import { typstChipSettings } from '$lib/languages/typst/visual/core/plugin/typstChipSettings';
import { typstChipCounts } from '$lib/languages/typst/visual/core/plugin/chipCounts';
import { footnoteNumbersKey, footnoteNumbersOf, footnoteNumbersPlugin } from '$lib/editor/visual/extensions/drawnChips/footnoteNumbers';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import TypstSetRuleSettings from '$lib/languages/typst/visual/plugins/setRule/TypstSetRuleSettings.svelte';
import TypstSpacingSettings from '$lib/languages/typst/visual/plugins/spacing/TypstSpacingSettings.svelte';
import CommentSettings from '$lib/editor/visual/extensions/drawnChips/CommentSettings.svelte';

const text = (source: string) => typstFace(source)?.dom.textContent ?? null;

describe('typstFace', () => {
	it('draws the page setup as readable lines of their own', () => {
		expect(text('#set page(paper: "a4", margin: 2.5cm)')).toBe('Page - A4 - 2.5cm margins');
		expect(text('#set text(font: "Libertinus Serif", size: 11pt, lang: "en")')).toBe('Text - Libertinus Serif - 11pt - en');
		expect(typstFace('#set heading(numbering: "1.")')?.line).toBe(true);
		// the comment ending its line is in the hint
		expect(text('#set text(lang: "de") // hyphenation')).toBe('Text - de');
	});

	it('draws breaks, spaces and outlines', () => {
		expect(text('#pagebreak(weak: true)')).toBe('Page Break');
		expect(text('#colbreak()')).toBe('Column break');
		expect(text('#outline(title: [Inhalt], depth: 2)')).toBe('Table of Contents - Inhalt - 2 levels');
		expect(text('#outline(target: figure.where(kind: table))')).toBe('List of Tables');
		const vertical = typstFace('#v(1em + 2pt)');
		expect(vertical?.line).toBe(true);
		expect(vertical?.dom.textContent).toBe('#v1em + 2pt');
		const horizontal = typstFace('#h(2em)');
		expect(horizontal?.character).toBe(true);
		expect(horizontal?.dom.style.width).toBe('2em');
	});

	it('numbers a footnote from the decoration its chip is handed', () => {
		const face = typstFace('#footnote[A note.]')!;
		const doc = typstToProseMirror('A#footnote[one] b#footnote[two].').doc;
		const state = EditorState.create({ doc, plugins: [footnoteNumbersPlugin(typstChipCounts)] });
		const decorations = footnoteNumbersKey.getState(state)!.find();
		expect(decorations.map((decoration) => footnoteNumbersOf([decoration]))).toEqual([['1'], ['2']]);
		face.decorate?.([decorations[1]] as Decoration[]);
		expect(face.dom.textContent).toBe('2');
	});

	it('draws placeholder text as its words and a symbol as its character', () => {
		expect(text('#lorem(5)')).toBe('Lorem ipsum dolor sit amet.');
		expect(text('#sym.arrow.r')).toBe('→');
		expect(typstFace('#sym.arrow.r')?.character).toBe(true);
		expect(text('#sym.nothing.here')).toBeNull();
	});

	it('leaves as code what it cannot draw', () => {
		expect(typstFace('#for i in range(2) [#i]')).toBeNull();
		expect(typstFace('#lorem(words)')).toBeNull();
		expect(typstFace('#{ let gap = 1em }')).toBeNull();
	});
});

describe('typstChipSettings', () => {
	it('gives each drawn call its panel, and a space by an amount no field shows its Typst', () => {
		expect(typstChipSettings('#set page(paper: "a4")')).toBe(TypstSetRuleSettings);
		expect(typstChipSettings('#v(1em)')).toBe(TypstSpacingSettings);
		expect(typstChipSettings('// a note')).toBe(CommentSettings);
		expect(typstFace('#v(gap)')).not.toBeNull();
		expect(typstChipSettings('#v(gap)')).toBeNull();
	});
});
