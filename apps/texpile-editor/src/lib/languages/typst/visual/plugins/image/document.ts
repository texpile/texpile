import {
	CROP_CALL,
	stringCaption,
	updateImageNode,
	type SchemaImageSettings,
	type TypstDocumentPlugin
} from '$lib/languages/typst/visual/core/document';
import { imageCode, imageFigureCode, imageFigureSeg, imageSeg } from './import/imageImport';
import { imageSave } from './imageSave';
import { readImage } from './imageCall';

// built by hand because the imageplugin.svelte settings creators pull in the DOM, and the image node must stay a block
// figure. numbered stays true (typst figures number themselves), unlike markdown's false
const schemaImageSettings: SchemaImageSettings = {
	hasTitle: true,
	isBlock: true,
	// typFigure: the #figure's arguments as the file wrote them (see figureArgs.ts); typIndent as a typ_env's
	extraAttributes: { width: null, height: null, maxWidth: null, typGap: null, labelGap: null, typFigure: null, typIndent: null }
};

export const imageDocument: TypstDocumentPlugin = {
	import: {
		calls: {
			blocks: { image: imageSeg, [CROP_CALL]: imageSeg, figure: imageFigureSeg },
			code: { image: imageCode, [CROP_CALL]: imageCode, figure: imageFigureCode }
		},
		chips: (source) => readImage(source.trim()) !== null
	},
	schema: ({ nodes, marks }) => ({ nodes: updateImageNode(nodes, schemaImageSettings), marks }),
	save: {
		nodes: { image: imageSave },
		wholeRun: (node) => node.type.name === 'image' && node.childCount === 0,
		stringBody: (node) => node.type.name === 'image' && stringCaption(node)
	}
};
