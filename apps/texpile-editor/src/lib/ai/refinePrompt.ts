// What Refine asks the agent, and how the answer becomes the new text

type FileFormat = { name: string; list: string };

const LATEX_LIST = 'an itemize environment with one \\item per point';
const DASH_LIST = 'one line per point, starting with "- "';
// each format writes lists, emphasis and math its own way, so the agent is told which one by the file's extension
const FORMATS: Record<string, FileFormat> = {
	tex: { name: 'LaTeX', list: LATEX_LIST },
	ltx: { name: 'LaTeX', list: LATEX_LIST },
	cls: { name: 'LaTeX document class', list: LATEX_LIST },
	sty: { name: 'LaTeX package', list: LATEX_LIST },
	typ: { name: 'Typst', list: DASH_LIST },
	md: { name: 'Markdown', list: DASH_LIST },
	markdown: { name: 'Markdown', list: DASH_LIST },
	bib: { name: 'BibTeX', list: DASH_LIST }
};
const PLAIN: FileFormat = { name: 'plain text', list: DASH_LIST };

/** the format a file is written in, by its extension */
export function fileFormat(path: string): FileFormat & { extension: string } {
	const extension = /\.([A-Za-z0-9]+)$/.exec(path)?.[1].toLowerCase() ?? '';
	return { ...(FORMATS[extension] ?? PLAIN), extension };
}

/** `path` only lends its extension; the file's name and folders stay here */
export type RefineRequest = { ask: string; path: string; passage: string; before: string; after: string };

/** `system` is what an agent takes in place of its own instructions, where it has a place for them */
export function refinePrompt(r: RefineRequest): { system: string; request: string } {
	const format = fileFormat(r.path);
	const file = format.extension ? `a ${format.name} file (.${format.extension})` : `a ${format.name} file`;
	const system = [
		`You are editing a passage of ${file}. The request names the task, then gives the passage with the text around it.`,
		`Reply with the new passage only, written in ${format.name}: no explanation, no quotation marks, no code fence.`,
		'Keep every command, formula, citation, cross-reference and label exactly as written unless the task needs otherwise.',
		'Never add a citation, a number or a claim the passage does not already have.',
		"Keep the author's voice and the spelling conventions the document uses.",
		`A list is ${format.list}.`
	].join('\n');
	const request = [
		r.ask,
		'',
		'Text before the passage, for context only:',
		'<<<',
		r.before,
		'>>>',
		'',
		'The passage:',
		'<<<',
		r.passage,
		'>>>',
		'',
		'Text after the passage, for context only:',
		'<<<',
		r.after,
		'>>>'
	].join('\n');
	return { system, request };
}

/** the answer as text to put in place of `passage`: a code fence dropped, the passage's own outer whitespace kept */
export function refinedText(answer: string, passage: string): string {
	let text = answer.trim();
	const fence = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(text);
	// a fence around the answer, not one the passage itself has
	if (fence && !/^\s*```/.test(passage)) text = fence[1].trim();
	return /^\s*/.exec(passage)![0] + text + /\s*$/.exec(passage)![0];
}

/** the text on either side of a passage the agent sees, cut to whole lines where there is one to cut at */
export function contextAround(
	text: string,
	from: number,
	to: number,
	[before, after]: [number, number]
): { before: string; after: string } {
	let start = Math.max(0, from - before);
	const line = start > 0 ? text.indexOf('\n', start) : -1;
	if (line >= 0 && line < from) start = line + 1;
	let end = Math.min(text.length, to + after);
	const last = end < text.length ? text.lastIndexOf('\n', end) : -1;
	if (last > to) end = last;
	return { before: text.slice(start, from), after: text.slice(to, end) };
}
