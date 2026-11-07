// a typ_figure and its caption
import type { NodeSpec } from 'prosemirror-model';

// `#figure(body, caption: [..], ..)` around anything but an image or a table: the body's blocks, then the caption.
// code says the body was an expression (a raw block, a call), written back as its one block's code; typFigure is the
// call's other arguments as the file wrote them, bodyLead and bodyTrail as an environment's
export const typFigureSpec: NodeSpec = {
	content: 'block+ typ_figure_caption?',
	group: 'block',
	definingAsContext: true,
	allowGapCursor: true,
	attrs: {
		code: { default: false },
		typFigure: { default: null },
		label: { default: null },
		labelGap: { default: null },
		bodyLead: { default: null },
		bodyTrail: { default: null },
		typIndent: { default: null }
	},
	parseDOM: [{ tag: 'figure.typ-figure', getAttrs: (dom) => ({ label: (dom as HTMLElement).getAttribute('data-label') || null }) }],
	toDOM: (node) => ['figure', { class: 'typ-figure', 'data-label': node.attrs.label }, 0]
};
// typString: the file wrote the caption as a string (`caption: "..."`), which it stays while it is plain text
export const typFigureCaptionSpec: NodeSpec = {
	content: 'inline*',
	attrs: { typString: { default: false } },
	parseDOM: [{ tag: 'figcaption.typ-figure-caption' }],
	toDOM: () => ['figcaption', { class: 'typ-figure-caption' }, 0]
};
