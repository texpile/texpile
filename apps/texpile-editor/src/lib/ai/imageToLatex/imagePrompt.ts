// What Convert to LaTeX asks of the agent, and how its answer is read back
import { CETZ_IMPORT } from '$lib/draw/cetz/source/pictures';

export type ImageDialect = 'latex' | 'typst' | 'markdown';

const LANGUAGE: Record<ImageDialect, string> = { latex: 'LaTeX', typst: 'Typst', markdown: 'Markdown' };

const RULES: Record<ImageDialect, string> = {
	latex: `- An equation: display math, \\[ ... \\] for one line and \\begin{align*} ... \\end{align*} for aligned lines.
- A table: a tabular environment, with booktabs rules when the picture has rules like them.
- A diagram, plot, graph, circuit or drawing: one tikzpicture environment. Put any \\usetikzlibrary line right above it.
- Text: plain LaTeX paragraphs, with inline math in $ ... $.
Use only amsmath, amssymb, booktabs and TikZ. Leave out \\documentclass, \\usepackage, figure environments, captions and labels.`,
	typst: `- An equation: display math, $ ... $ with a space after the opening $ and before the closing one.
- A table: a #table call.
- A diagram, plot, graph, circuit or drawing: a CeTZ canvas, starting with the line ${CETZ_IMPORT} and then #canvas({ import draw: * ... }).
- Text: plain Typst paragraphs.
Leave out #set and #show rules, figures, captions and labels.`,
	markdown: `- An equation: display math in $$ ... $$, written in LaTeX.
- A table: a pipe table.
- Text: Markdown paragraphs, with inline math in $ ... $.`
};

export function imageSystem(dialect: ImageDialect): string {
	const language = LANGUAGE[dialect];
	return `You turn a picture from a paper, slide, scan or screen into ${language} source that reproduces it. Copy exactly what the picture shows: every symbol, label, number and line, in the same order and layout.

${RULES[dialect]}

Answer with the ${language} alone, in one fenced code block.`;
}

export function imageRequest(dialect: ImageDialect): string {
	return `Write the ${LANGUAGE[dialect]} for this picture.`;
}

const DRAWING = 'DRAWING';

/** the fast model's request, which hands a drawing on to the strong model */
export function imageFastRequest(dialect: ImageDialect): string {
	return `${imageRequest(dialect)} If it is a diagram, plot, graph, circuit or drawing, answer with the single word ${DRAWING} instead.`;
}

export function handedOn(answer: string): boolean {
	return answer.replace(/[`.\s]/g, '') === DRAWING;
}

/** asked once when the drawing does not compile, with the error */
export function imageRetryRequest(dialect: ImageDialect, answer: string, error: string): string {
	return `You wrote this ${LANGUAGE[dialect]} for the picture:

${'```'}
${answer}
${'```'}

It fails with this error:
${error}

Write the corrected ${LANGUAGE[dialect]} for the same picture.`;
}

/** the code block's contents, or the whole answer when it has none */
export function imageAnswerSource(answer: string): string {
	const fenced = /```[\w-]*[ \t]*\n([\s\S]*?)\n?```/.exec(answer);
	return (fenced ? fenced[1] : answer).trim();
}
