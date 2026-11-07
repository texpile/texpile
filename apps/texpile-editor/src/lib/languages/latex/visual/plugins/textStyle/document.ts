import type { LatexDocumentPlugin } from '$lib/languages/latex/visual/core/document';
import { TEXT_STYLE_COMMANDS } from './textStyleCommands';
import { textStyleWrap } from './textStyleLatex';
import { textStyleMarkSpec } from './textStyleMark';

export const textStyleDocument: LatexDocumentPlugin = {
	import: { commands: TEXT_STYLE_COMMANDS },
	// text_style first: the lowest rank is written innermost, inside every wrapper that held it in the file
	schema: ({ nodes, marks }) => ({ nodes, marks: marks.addToStart('text_style', textStyleMarkSpec) }),
	save: {
		marks: {
			text_style: textStyleWrap,
			strong: () => ({ open: '\\textbf{', close: '}' }),
			// em is \textit unless the file said \emph
			em: (a) => (a.cmd === 'emph' ? { open: '\\emph{', close: '}' } : { open: '\\textit{', close: '}' }),
			u: () => ({ open: '\\underline{', close: '}' }),
			sup: () => ({ open: '\\textsuperscript{', close: '}' }),
			sub: () => ({ open: '\\textsubscript{', close: '}' }),
			code: () => ({ open: '\\texttt{', close: '}' })
		}
	}
};
