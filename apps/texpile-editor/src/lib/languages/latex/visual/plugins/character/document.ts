import {
	PLAIN_TEXT_COMMANDS,
	type ConversionContext,
	type ImportCall,
	type LatexCommandImport,
	type LatexDocumentPlugin,
	type PmNode,
	type TreeImport
} from '$lib/languages/latex/visual/core/document';

function logo(im: TreeImport, call: ImportCall, ctx: ConversionContext): PmNode[] {
	return [im.core.chip(call, ctx)];
}

export const characterDocument: LatexDocumentPlugin = {
	import: {
		commands: {
			// the logos stay chips: as plain text they came back as the words, not the logos
			LaTeX: logo,
			TeX: logo,
			...Object.fromEntries(
				Object.entries(PLAIN_TEXT_COMMANDS).map(([name, char]): [string, LatexCommandImport] => [
					name,
					(im, _call, ctx) => im.core.texts(char, ctx.marks.length > 0 ? ctx.marks : null)
				])
			)
		}
	}
};
