import type { Node } from 'prosemirror-model';
import type { Ctx, LatexSaveCore } from '$lib/languages/latex/visual/core/document';

const HEADING_CMD: Record<number, string> = {
	1: '\\section',
	2: '\\subsection',
	3: '\\subsubsection',
	4: '\\paragraph',
	5: '\\subparagraph'
};

export function headingLatex(node: Node, _ctx: Ctx, core: LatexSaveCore): string {
	if (node.childCount === 0) return '';
	// a heading's text is a moving argument: a \footnote joined in from a paragraph stops the compile unless protected
	const text = core.children(node, false).replace(/(?<!\\protect\s*)\\footnote(?![a-zA-Z@])/g, '\\protect\\footnote');
	// \chapter and \part have no level of their own in the editor; the source command is kept
	const cmd =
		typeof node.attrs.command === 'string' && node.attrs.command
			? `\\${node.attrs.command}`
			: (HEADING_CMD[Number(node.attrs.level ?? 1)] ?? '\\section');
	const star = node.attrs.numbered === false ? '*' : '';
	// a `]` inside the short title would close the optional argument early; bracing the whole
	// argument is how LaTeX carries one
	const shortTitle = typeof node.attrs.shortTitle === 'string' ? node.attrs.shortTitle : '';
	const short = shortTitle ? `[${shortTitle.includes(']') ? `{${shortTitle}}` : shortTitle}]` : '';
	return `${cmd}${star}${short}{${text}}\n`;
}
