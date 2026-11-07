import { markedFirst, type LatexDocumentPlugin } from '$lib/languages/latex/visual/core/document';
import { colorMark, highlightMark, textcolorMark } from './colorMarks';

export const colorDocument: LatexDocumentPlugin = {
	import: {
		commands: {
			textcolor: (im, call, ctx) => colorMark(im, call, ctx, 'textcolor'),
			// no color of its own: the document's \sethlcolor applies, and the serializer writes it bare again
			hl: (im, call, ctx) => markedFirst(im, call, ctx, { type: 'highlight', attrs: { color: null } }),
			colorbox: (im, call, ctx) => colorMark(im, call, ctx, 'highlight', { cmd: 'colorbox' })
		}
	},
	// highlight is soul's \hl
	save: { marks: { textcolor: textcolorMark, highlight: highlightMark } }
};
