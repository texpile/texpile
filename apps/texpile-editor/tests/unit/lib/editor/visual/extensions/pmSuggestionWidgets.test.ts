// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { pictureKey, saveDrawing } from '$lib/draw/host/drawingCache';
import { oldNodeElement, replacedPicture } from '$lib/editor/visual/extensions/pmSuggestionWidgets';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';

const { schema } = parseLatexFile('Words.\n').doc.type;
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="2" height="1"/></svg>';

function rawBlock(source: string) {
	return schema.nodes.raw_latex.create(null, schema.text(source));
}

function oldElement(was: string, now: string) {
	const [old, current] = [rawBlock(was), rawBlock(now)];
	return oldNodeElement(old, 'thread', false, replacedPicture(old, current));
}

it('shows a replaced picture as it was drawn, under the name its card keeps', () => {
	const canvas = 'cetz.canvas({\n  rect((0, 0), (2, 1))\n})';
	const tikz = '\\begin{tikzpicture}\n\\draw (0,0) rectangle (2,1);\n\\end{tikzpicture}';
	const float = (picture: string, caption: string) => `\\begin{figure}\n${picture}\n\\caption{${caption}}\n\\end{figure}`;
	saveDrawing(pictureKey(canvas), SVG);
	saveDrawing(pictureKey(tikz), SVG);

	expect(oldElement(`#${canvas}`, `#${canvas.replace('2, 1', '3, 1')}`).querySelector('svg rect')).not.toBeNull();
	expect(oldElement(float(tikz, 'One.'), float(tikz.replace('(2,1)', '(3,1)'), 'One.')).querySelector('svg rect')).not.toBeNull();
	// the caption changed and the picture did not: the old drawing would show nothing of the change
	expect(oldElement(float(tikz, 'One.'), float(tikz, 'Two.')).querySelector('code')?.textContent).toContain('One.');
	// no drawing kept for this one
	expect(oldElement('#cetz.canvas({\n  circle((0, 0))\n})', `#${canvas}`).querySelector('code')?.textContent).toContain('circle');
});
