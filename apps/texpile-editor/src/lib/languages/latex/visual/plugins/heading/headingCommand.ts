import {
	argText,
	createDefaultContext,
	firstBraced,
	hasStar,
	optionalArg,
	type ImportCall,
	type LatexCommandImport,
	type PmNode,
	type TreeImport
} from '$lib/languages/latex/visual/core/document';

function headingOf(im: TreeImport, call: ImportCall, level: number, command: string | null = null): PmNode[] {
	const arg = firstBraced(call);
	const content = arg?.body ? im.core.inline(arg.body, createDefaultContext()) : [];
	const short = optionalArg(call);
	return [
		im.core.node('heading', { level, numbered: !hasStar(call), command, shortTitle: short ? argText(im.src, short) : null }, content)
	];
}

function heading(level: number, command: string | null = null): LatexCommandImport {
	return (im, call) => headingOf(im, call, level, command);
}

export const HEADING_COMMANDS: Record<string, LatexCommandImport> = {
	section: heading(1),
	subsection: heading(2),
	subsubsection: heading(3),
	paragraph: heading(4),
	subparagraph: heading(5),
	chapter: heading(1, 'chapter'),
	part: heading(1, 'part')
};
