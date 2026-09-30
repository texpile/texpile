// An image figure's label, set from its settings panel, is written as `<fig:x>` after the figure,
// where typst attaches it and @ references reach it. Only the label changes in the file.
import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';

/** parse, change the first image's attrs as the settings panel does, save */
function editImage(src: string, attrs: Record<string, unknown>): string {
	const parsed = parseTypstFile(src);
	let at = -1;
	parsed.doc.descendants((node, pos) => {
		if (at < 0 && node.type.name === 'image') at = pos;
	});
	const node = parsed.doc.nodeAt(at)!;
	const tr = EditorState.create({ doc: parsed.doc }).tr.setNodeMarkup(at, undefined, { ...node.attrs, ...attrs });
	return serializeTypstFile(parsed, tr.doc);
}

const FIGURE = 'Before.\n\n#figure(image("a.png", width: 70%), caption: [A plot.])\n\nSee the plot.\n';

describe('an image figure label', () => {
	it('is written after the figure, and reads back as the label', () => {
		const out = editImage(FIGURE, { label: 'fig:plot' });
		expect(out).toBe(FIGURE.replace('caption: [A plot.])', 'caption: [A plot.]) <fig:plot>'));
		expect(typstToProseMirror(out).doc.child(1).attrs.label).toBe('fig:plot');
	});

	it('is renamed and removed where it stands, a line end before it kept', () => {
		const labeled = '#figure(image("a.png"))\n<fig:a>\n\nSee @fig:a.\n';
		expect(editImage(labeled, { label: 'fig:b' })).toBe(labeled.replace('<fig:a>', '<fig:b>'));
		expect(editImage(labeled, { label: null })).toBe('#figure(image("a.png"))\n\nSee @fig:a.\n');
	});

	it('makes a bare image a figure, the only thing typst references', () => {
		const out = editImage('#image("a.png")\n', { label: 'fig:a', numbered: true });
		expect(out).toBe('#figure(image("a.png")) <fig:a>\n');
		expect(typstToProseMirror(out).doc.child(0).attrs).toMatchObject({ label: 'fig:a', numbered: true });
	});
});
