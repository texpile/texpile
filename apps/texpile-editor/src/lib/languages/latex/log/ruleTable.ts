// the enrichment rule table: a stable ruleId, a hint, a suggested package, and the offending command

import type { LogEntry } from '$lib/compileLog/types';
import type { Engine } from '$lib/workspace/compileCommand';
import { REFERENCE_RULES } from './ruleTableRefs';
import { graphicExtensionsFor } from '../knowledge/registries/graphicExtensions';
import { packageDefining } from '../knowledge/commands/packageFor';

function unknownGraphicsHint(_entry: LogEntry, _m: RegExpMatchArray, compiledWith: Engine | null): string {
	const engine = compiledWith ?? 'pdflatex';
	const formats = [...new Set(graphicExtensionsFor(engine).map((e) => e.slice(1).toUpperCase()))];
	return `This image format is not supported by the engine you are compiling with. ${engine} accepts ${formats.slice(0, -1).join(', ')} and ${formats.at(-1)} (an SVG needs the svg package or pre-conversion).`;
}

export type EnrichmentRule = {
	id: string;
	match: RegExp;
	hint?: string | ((entry: LogEntry, m: RegExpMatchArray, engine: Engine | null) => string | undefined);
	/** pulls the offending \command out of the error context. */
	command?: (entry: LogEntry) => string | undefined;
	/** text (a label/cite key) the editor can search for on the line, for a precise range. */
	anchor?: (m: RegExpMatchArray) => string | undefined;
	/** suppress when an earlier entry already matched one of these rule ids (cascade noise). */
	cascadesFrom?: string[];
};

/** last \command in the first context line, the engine echoes the offender there. */
function commandFromContext(entry: LogEntry): string | undefined {
	if (!entry.context) return undefined;
	const firstLine = entry.context.split('\n')[0];
	const commands = firstLine.match(/\\[a-zA-Z@]+/g);
	return commands ? commands[commands.length - 1] : undefined;
}

export const RULES: EnrichmentRule[] = [
	{
		id: 'undefined-control-sequence',
		match: /^Undefined control sequence/,
		command: commandFromContext,
		hint: (entry) => {
			const cmd = commandFromContext(entry);
			const pkg = cmd ? packageDefining('command', cmd.slice(1)) : undefined;
			if (cmd && pkg) return `${cmd} is not defined. It comes from the ${pkg} package: add \\usepackage{${pkg}} to the preamble.`;
			if (cmd) return `${cmd} is not defined. Check the spelling, or add the package (or \\newcommand) that defines it.`;
			return 'A command used here is not defined. Check its spelling, or load the package that defines it.';
		}
	},
	{
		id: 'environment-undefined',
		match: /^LaTeX Error: Environment (\S+) undefined/,
		hint: (_e, m) => {
			const env = m[1];
			const pkg = packageDefining('environment', env);
			return pkg
				? `The ${env} environment comes from the ${pkg} package: add \\usepackage{${pkg}} to the preamble.`
				: `No \\begin{${env}} environment is defined. Check the spelling, or load the package that provides it.`;
		}
	},
	{
		id: 'missing-dollar',
		match: /^Missing \$ inserted/,
		hint: 'Math-only material (like _, ^, or a math command) appears outside math mode. Wrap it in $...$, or escape the character (\\_).'
	},
	{
		id: 'missing-brace',
		match: /^Missing [{}] inserted/,
		hint: 'Braces are unbalanced near here: a { or } is missing or extra.'
	},
	{
		id: 'extra-brace-or-dollar',
		match: /^Extra \}, or forgotten \$/,
		hint: 'A } has no matching {, or math was opened with $ and never closed.'
	},
	{
		id: 'runaway-argument',
		match: /^Runaway (argument|definition|text|preamble)\?/,
		hint: 'An argument never ends: a closing brace is missing, so TeX kept reading. Look for the { that is never closed.'
	},
	{
		id: 'paragraph-ended-early',
		match: /^Paragraph ended before (\S+) was complete/,
		hint: "Usually a missing closing brace: the command's argument ran into a blank line before its } appeared."
	},
	{
		id: 'file-ended-while-scanning',
		match: /^File ended while scanning (use of (\S+)|text of|definition of)?/,
		hint: "The file ended while a command's argument (or an environment) was still open: a closing brace or \\end{...} is missing."
	},
	{
		id: 'file-not-found',
		match: /^LaTeX Error: File `([^']+)' not found/,
		hint: (_e, m) => `The file "${m[1]}" could not be found. Check the path (relative to the folder the compile runs in) and the extension.`
	},
	{
		id: 'engine-file-not-found',
		match: /^I can't find file `([^']+)'/,
		hint: (_e, m) => `The file "${m[1]}" could not be found. Check the path and extension.`
	},
	{
		id: 'unknown-graphics-extension',
		match: /^LaTeX Error: Unknown graphics extension: (\S+)/,
		hint: unknownGraphicsHint
	},
	{
		id: 'cannot-determine-graphics-size',
		match: /^Package (?:graphics|graphicx) Error: Cannot determine size of graphic/,
		hint: 'The image file is readable but its dimensions could not be determined: it may be corrupt, or an EPS/unsupported format compiled with pdflatex.'
	},
	{
		id: 'env-mismatch',
		match: /^LaTeX Error: \\begin\{([^}]+)\}(?: on input line (\d+))? ended by \\end\{([^}]+)\}/,
		hint: (_e, m) => `\\begin{${m[1]}} is closed by \\end{${m[3]}}. Make the two names match (or remove the stray one).`
	},
	{
		id: 'misplaced-alignment-tab',
		match: /^Misplaced alignment tab character &/,
		hint: 'A bare & only works inside tables and alignments. In text, write \\&; in an equation, use an alignment environment like align.'
	},
	{
		id: 'extra-alignment-tab',
		match: /^Extra alignment tab has been changed to \\cr/,
		hint: 'A table row has more & separators than the column specification allows. Add a column, or remove the extra &.'
	},
	{
		id: 'display-math-dollar',
		match: /^Display math should end with \$\$/,
		hint: 'Display math opened with $$ was closed with a single $ (or vice versa). Prefer \\[...\\] for display math.'
	},
	{
		id: 'double-script',
		match: /^Double (superscript|subscript)/,
		hint: (_e, m) => `Two ${m[1]}s in a row (like x^a^b). Brace the intended grouping: x^{a^b} or x^{ab}.`
	},
	{
		id: 'missing-item',
		match: /^LaTeX Error: Something's wrong--perhaps a missing \\item/,
		hint: 'Content appears inside a list environment before the first \\item (or the list is empty). Start the entry with \\item.'
	},
	{
		id: 'lonely-item',
		match: /^LaTeX Error: Lonely \\item/,
		hint: '\\item is only valid inside a list environment (itemize, enumerate, description). Wrap it in \\begin{itemize}...\\end{itemize}.'
	},
	{
		id: 'missing-begin-document',
		match: /^LaTeX Error: Missing \\begin\{document\}/,
		hint: 'Typeset material appears before \\begin{document}. Something in the preamble is producing text, often a stray character or a misplaced paragraph.'
	},
	{
		id: 'can-only-preamble',
		match: /^LaTeX Error: Can be used only in preamble/,
		hint: 'This command (like \\usepackage or \\documentclass) must appear before \\begin{document}.'
	},
	{
		id: 'caption-outside-float',
		match: /^LaTeX Error: \\caption outside float/,
		hint: '\\caption only works inside figure/table environments. Outside one, use \\captionof{figure}{...} from the caption package.'
	},
	{
		id: 'command-already-defined',
		match: /^LaTeX Error: Command (\S+) already defined/,
		hint: (_e, m) => `${m[1]} already exists. Use \\renewcommand to replace it, or pick a different name.`
	},
	{
		id: 'option-clash',
		match: /^LaTeX Error: Option clash for package (\S+)/,
		hint: (_e, m) =>
			`${m[1]} is loaded twice with different options (possibly once by the class or another package). Load it once, or pass the options via \\PassOptionsToPackage before the first load.`
	},
	{
		id: 'math-only-command',
		match: /^LaTeX Error: \\math\w+ allowed only in math mode|^Package amsmath Error: (\S+) allowed only in math mode/,
		hint: 'This command only works inside math mode; wrap it in $...$.'
	},
	{
		id: 'missing-right',
		match: /^Missing \\right\.? inserted/,
		hint: 'A \\left( has no matching \\right). Every \\left needs a \\right (use \\right. for an invisible one).'
	},
	{
		id: 'extra-right',
		match: /^Extra \\right/,
		hint: 'A \\right has no matching \\left before it in the same formula.'
	},
	{
		id: 'unicode-char',
		match:
			/^LaTeX Error: (?:Unicode character|Invalid UTF-8 byte)|^Package inputenc Error: (Unicode character|Invalid UTF-8|Keyboard character)/,
		hint: 'The source contains a character the engine cannot typeset directly (often pasted from a PDF: curly quotes, math glyphs, invisible spaces, or a non-UTF-8 file). Replace it with the LaTeX command for that symbol, re-save the file as UTF-8, or compile with LuaLaTeX/XeLaTeX.'
	},
	{
		id: 'graphics-file-not-found',
		match: /^Package pdftex\.def Error: File `([^']+)' not found/,
		hint: (_e, m) =>
			m[1].endsWith('-eps-converted-to.pdf')
				? `The EPS figure could not be auto-converted to PDF (epstopdf needs shell escape, and compiles here run without it). Convert the .eps to .pdf yourself and reference that, or pre-run epstopdf.`
				: `The image "${m[1]}" could not be found. Check the path and the extension.`
	},
	{
		id: 'dimension-too-large',
		match: /^Dimension too large/,
		hint: "A computed length exceeds TeX's maximum (~575cm). Usually a wrong unit or a runaway scaling factor."
	},
	{
		id: 'illegal-unit',
		match: /^Illegal unit of measure/,
		hint: 'A length is missing its unit. Write 2cm, 10pt, 0.5\\textwidth; a bare number is not a length.'
	},
	...REFERENCE_RULES
];
