import type { LatexDocumentPlugin } from '$lib/languages/latex/visual/core/document';
import { frameCommand, isSlideCommand, SLIDE_ENVIRONMENTS } from './import/slideTree';
import { overlay } from './import/overlay';
import { SLIDE_BLOCKS, SLIDE_SAVES, slideHeaderHolds } from './save/slideSerializer';
import { overlayMarkSpec, slideNodeSpecs } from './slideSchema';

// a deck's \frame{...} and \titlepage stand on their own, which \frame does not elsewhere (a picture's box)
const SLIDE_MACROS = new Set(['frame', 'titlepage']);

export const slidesDocument: LatexDocumentPlugin = {
	import: {
		commands: {
			frame: (im, call) => frameCommand(im, call) ?? [im.core.chip(call)],
			only: overlay,
			uncover: overlay,
			visible: overlay,
			invisible: overlay
		},
		environments: SLIDE_ENVIRONMENTS,
		blocks: (name, im) => SLIDE_MACROS.has(name) && isSlideCommand(im, 'frame')
	},
	schema: ({ nodes, marks }) => ({ nodes: nodes.append(slideNodeSpecs), marks: marks.addToEnd('overlay', overlayMarkSpec) }),
	save: {
		nodes: SLIDE_SAVES,
		marks: { overlay: (a) => ({ open: `\\${String(a.command ?? 'only')}${String(a.spec ?? '')}{`, close: '}' }) },
		frameHolds: slideHeaderHolds,
		endsParagraph: SLIDE_BLOCKS
	}
};
