import { argText, chipWithoutPar, mandatoryArgs, type LatexDocumentPlugin } from '$lib/languages/latex/visual/core/document';

export const ruleDocument: LatexDocumentPlugin = {
	import: {
		blocks: (name) => name === 'hrule' || name === 'rule',
		commands: {
			hrule: (im) => [im.core.node('horizontal_rule')],
			// \rule{\linewidth}{0.4pt} is exactly what horizontal_rule writes; any other \rule is a sized box or strut
			rule: (im, call) => {
				const dims = mandatoryArgs(call).map((a) => argText(im.src, a).trim());
				if (dims.length === 2 && dims[0] === '\\linewidth' && dims[1] === '0.4pt') return [im.core.node('horizontal_rule')];
				return chipWithoutPar(im, call);
			}
		}
	},
	save: { nodes: { horizontal_rule: () => '\\par\\noindent\\rule{\\linewidth}{0.4pt}\n' } }
};
