// enrichment rules: attach a stable ruleId, a hint, a suggested package, and the offending command

import type { LogEntry } from './types';

interface EnrichmentRule {
	id: string;
	match: RegExp;
	hint?: string | ((entry: LogEntry, m: RegExpMatchArray) => string | undefined);
	/** pulls the offending \command out of the error context. */
	command?: (entry: LogEntry) => string | undefined;
	/** text (a label/cite key) the editor can search for on the line, for a precise range. */
	anchor?: (m: RegExpMatchArray) => string | undefined;
	/** suppress when an earlier entry already matched one of these rule ids (cascade noise). */
	cascadesFrom?: string[];
}

// package that defines a command, for "Undefined control sequence" hints
const PACKAGE_FOR_COMMAND: Record<string, string> = {
	'\\includegraphics': 'graphicx',
	'\\mathbb': 'amssymb',
	'\\mathfrak': 'amssymb',
	'\\bm': 'bm',
	'\\boldsymbol': 'amsmath',
	'\\text': 'amsmath',
	'\\eqref': 'amsmath',
	'\\citep': 'natbib',
	'\\citet': 'natbib',
	'\\autocite': 'biblatex',
	'\\textcite': 'biblatex',
	'\\printbibliography': 'biblatex',
	'\\url': 'hyperref',
	'\\href': 'hyperref',
	'\\toprule': 'booktabs',
	'\\midrule': 'booktabs',
	'\\bottomrule': 'booktabs',
	'\\cmidrule': 'booktabs',
	'\\multirow': 'multirow',
	'\\SI': 'siunitx',
	'\\num': 'siunitx',
	'\\textcolor': 'xcolor',
	'\\definecolor': 'xcolor',
	'\\rowcolor': 'colortbl',
	'\\FloatBarrier': 'placeins',
	'\\captionof': 'caption',
	'\\subcaption': 'subcaption',
	'\\subfloat': 'subfig',
	'\\lstinline': 'listings',
	'\\lstset': 'listings',
	'\\newfloat': 'float',
	'\\xspace': 'xspace',
	'\\ifthenelse': 'ifthen',
	'\\setstretch': 'setspace',
	'\\todo': 'todonotes',
	'\\cellcolor': 'colortbl',
	'\\DeclarePairedDelimiter': 'mathtools',
	'\\coloneqq': 'mathtools',
	'\\cref': 'cleveref',
	'\\Cref': 'cleveref'
};

const PACKAGE_FOR_ENVIRONMENT: Record<string, string> = {
	align: 'amsmath',
	'align*': 'amsmath',
	alignat: 'amsmath',
	gather: 'amsmath',
	multline: 'amsmath',
	split: 'amsmath',
	cases: 'amsmath',
	subequations: 'amsmath',
	algorithm: 'algorithm',
	algorithmic: 'algorithmic',
	lstlisting: 'listings',
	minted: 'minted',
	tikzpicture: 'tikz',
	tabularx: 'tabularx',
	longtable: 'longtable',
	subfigure: 'subcaption',
	wrapfigure: 'wrapfig',
	mdframed: 'mdframed',
	tcolorbox: 'tcolorbox',
	siderules: 'mdframed',
	theorem: 'amsthm',
	proof: 'amsthm'
};

/** last \command in the first context line, the engine echoes the offender there. */
function commandFromContext(entry: LogEntry): string | undefined {
	if (!entry.context) return undefined;
	const firstLine = entry.context.split('\n')[0];
	const commands = firstLine.match(/\\[a-zA-Z@]+/g);
	return commands ? commands[commands.length - 1] : undefined;
}

const RULES: EnrichmentRule[] = [
	{
		id: 'undefined-control-sequence',
		match: /^Undefined control sequence/,
		command: commandFromContext,
		hint: (entry) => {
			const cmd = commandFromContext(entry);
			const pkg = cmd ? PACKAGE_FOR_COMMAND[cmd] : undefined;
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
			const pkg = PACKAGE_FOR_ENVIRONMENT[env];
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
		hint: (_e, m) => `The file "${m[1]}" could not be found. Check the path (relative to the main file) and the extension.`
	},
	{
		id: 'engine-file-not-found',
		match: /^I can't find file `([^']+)'/,
		hint: (_e, m) => `The file "${m[1]}" could not be found. Check the path and extension.`
	},
	{
		id: 'unknown-graphics-extension',
		match: /^LaTeX Error: Unknown graphics extension: (\S+)/,
		hint: 'This image format is not supported by the engine you are compiling with. pdflatex accepts PDF, PNG and JPG (EPS needs conversion; SVG needs the svg package or pre-conversion).'
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
	{
		id: 'undefined-reference',
		match: /^LaTeX Warning: Reference `([^']+)' on page \d+ undefined/,
		anchor: (m) => m[1],
		hint: (_e, m) =>
			`\\ref{${m[1]}} has no matching \\label{${m[1]}}. Add the label, fix the name, or recompile once more if you just added it.`
	},
	{
		id: 'undefined-citation',
		match: /^(?:LaTeX|Package natbib|Package biblatex) Warning: Citation [`']([^']+)'? .*undefined/,
		anchor: (m) => m[1],
		hint: (_e, m) =>
			`The key "${m[1]}" is not in the bibliography. Check the key, the .bib file, and that the bibliography tool (bibtex/biber) has run.`
	},
	{
		id: 'undefined-references-summary',
		match: /^LaTeX Warning: There were undefined references/,
		cascadesFrom: ['undefined-reference', 'undefined-citation']
	},
	{
		id: 'multiply-defined-label',
		match: /^LaTeX Warning: Label `([^']+)' multiply defined/,
		anchor: (m) => m[1],
		hint: (_e, m) => `Two \\label{${m[1]}} exist. Every label must be unique.`
	},
	{
		id: 'multiply-defined-summary',
		match: /^LaTeX Warning: There were multiply-defined labels/,
		cascadesFrom: ['multiply-defined-label']
	},
	{
		id: 'labels-changed-rerun',
		match: /^LaTeX Warning: Label\(s\) may have changed/,
		hint: 'Cross-references moved; compile once more and this goes away.'
	},
	{
		id: 'float-specifier-changed',
		match: /^LaTeX Warning: `!?h' float specifier changed to `!?ht'/,
		hint: "A [h] float placement could not be honored; LaTeX fell back to [ht]. Harmless, or use the float package's [H] to force exact placement."
	},
	{
		id: 'missing-character',
		match: /^Missing character: There is no (.+?) in font/,
		hint: 'The current font has no glyph for this character, so it was silently dropped from the output.'
	},
	{
		id: 'fontshape-undefined',
		match: /^LaTeX Font Warning: Font shape .* undefined/,
		hint: 'The requested font variant does not exist; LaTeX substituted a close one. Usually harmless.'
	},
	{
		id: 'bib-entry-not-found',
		match: /^I didn't find a database entry for ["'](.+?)["']/,
		hint: (_e, m) => `No entry with key "${m[1]}" exists in the bibliography files. Check the key against the .bib file.`
	},
	{
		id: 'bib-syntax-error',
		match: /^I was expecting a |syntax error: /,
		hint: 'The .bib file has a syntax error at this point, usually a missing comma, brace, or quote in the entry above.'
	},
	{
		id: 'bib-runaway-string',
		match: /possible runaway string started at line (\d+)/,
		hint: 'A quote or brace opened in the .bib file is never closed; the string runs on past where it should end.'
	},
	{
		id: 'bib-bad-crossref',
		match: /^A bad cross reference---entry/,
		hint: 'The crossref field names an entry that does not exist in the .bib file.'
	},
	{
		id: 'bib-empty-field',
		match: /^empty (\w+) in (\S+)/,
		hint: (_e, m) => `The entry "${m[2]}" has no ${m[1]} field, which the bibliography style expects.`
	},
	{
		id: 'bib-style-not-found',
		match: /^I couldn't open style file (.+)\.bst/,
		hint: (_e, m) => `\\bibliographystyle names "${m[1]}", but no ${m[1]}.bst exists. Check the style name.`
	},
	{
		id: 'bib-no-citations',
		match: /^I found no \\citation commands/,
		hint: 'The document cites nothing (or the .aux file is stale). Add a \\cite, or recompile so the .aux regenerates.'
	}
];

/** attaches ruleId/hint/suggestedPackage/command (mutating) and drops summary entries that restate earlier ones. */
export function enrichLogEntries(entries: LogEntry[]): LogEntry[] {
	const seen = new Set<string>();
	const kept: LogEntry[] = [];
	for (const entry of entries) {
		const rule = RULES.find((r) => r.match.test(entry.message));
		if (rule) {
			entry.ruleId = rule.id;
			const m = entry.message.match(rule.match)!;
			if (typeof rule.hint === 'function') entry.hint = rule.hint(entry, m);
			else if (rule.hint) entry.hint = rule.hint;
			if (rule.command) entry.command = rule.command(entry);
			if (rule.anchor && entry.anchorText === undefined) entry.anchorText = rule.anchor(m);
			if (entry.hint) {
				const pkg = entry.hint.match(/\\usepackage\{([\w-]+)\}/);
				if (pkg) entry.suggestedPackage = pkg[1];
			}
			if (rule.cascadesFrom?.some((id) => seen.has(id))) {
				continue; // drop the restatement, the root cause is already listed
			}
			seen.add(rule.id);
		}
		kept.push(entry);
	}
	return kept;
}
