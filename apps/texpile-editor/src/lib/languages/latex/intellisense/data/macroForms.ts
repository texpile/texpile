/* eslint id-denylist: "off" -- "info" here is @codemirror/autocomplete's Completion field, also the vendored LaTeX Workshop data shape */
// from LaTeX Workshop's data/macros.json and data/packages/tex.json (MIT, github.com/James-Yu/LaTeX-Workshop): the
// forms that insert more than a command, offered next to the package data
export type MacroForm = {
	/** completion label after the backslash, e.g. 'left(' */
	label: string;
	/** CodeMirror snippet inserted after the backslash */
	snippet: string;
	detail?: string;
	math?: boolean;
	/** reopen the completion dropdown after accepting (LW's triggerSuggest action) */
	chain?: boolean;
};

export const MACRO_FORMS: MacroForm[] = [
	{ label: 'begin', snippet: 'begin{', detail: 'Begin a new environment', chain: true },
	{ label: 'end', snippet: 'end{', detail: 'End an environment', chain: true },
	{ label: 'left(', snippet: 'left(${1}\\right)', detail: '\\left( ... \\right)', math: true },
	{ label: 'left[', snippet: 'left[${1}\\right]', detail: '\\left[ ... \\right]', math: true },
	{ label: 'left{', snippet: 'left\\\\{${1}\\right\\\\}', detail: '\\left\\{ ... \\right\\}', math: true },
	{ label: 'left|', snippet: 'left|${1}\\right|', detail: '\\left| ... \\right|', math: true },
	{ label: 'left\\|', snippet: 'left\\|${1}\\right\\|', detail: '\\left\\| ... \\right\\|', math: true },
	{ label: '(', snippet: '(${1}\\)', detail: 'inline math \\( ... \\)' },
	{ label: '[', snippet: '[${1}\\]', detail: 'display math \\[ ... \\]' },
	// the builder prepends the backslash, so `\{` here becomes the escaped `\\{` in the template
	{ label: '{', snippet: '\\{${1}\\\\}', detail: 'curly brackets \\{ ... \\}' },
	{ label: 'big(', snippet: 'big(${1}\\big)', math: true },
	{ label: 'big[', snippet: 'big[${1}\\big]', math: true },
	{ label: 'big|', snippet: 'big|${1}\\big|', math: true },
	{ label: 'Big(', snippet: 'Big(${1}\\Big)', math: true },
	{ label: 'Big[', snippet: 'Big[${1}\\Big]', math: true },
	{ label: 'Big|', snippet: 'Big|${1}\\Big|', math: true },
	{ label: 'bigl(', snippet: 'bigl(${1}\\bigr)', math: true },
	{ label: 'bigl[', snippet: 'bigl[${1}\\bigr]', math: true },
	{ label: 'bigl\\{', snippet: 'bigl\\\\{${1}\\bigr\\\\}', math: true },
	{ label: 'Bigl(', snippet: 'Bigl(${1}\\Bigr)', math: true },
	{ label: 'Bigl[', snippet: 'Bigl[${1}\\Bigr]', math: true },
	{ label: 'Bigl\\{', snippet: 'Bigl\\\\{${1}\\Bigr\\\\}', math: true },
	{ label: 'biggl(', snippet: 'biggl(${1}\\biggr)', math: true },
	{ label: 'biggl[', snippet: 'biggl[${1}\\biggr]', math: true },
	{ label: 'biggl\\{', snippet: 'biggl\\\\{${1}\\biggr\\\\}', math: true },
	{ label: 'Biggl(', snippet: 'Biggl(${1}\\Biggr)', math: true },
	{ label: 'Biggl[', snippet: 'Biggl[${1}\\Biggr]', math: true },
	{ label: 'Biggl\\{', snippet: 'Biggl\\\\{${1}\\Biggr\\\\}', math: true },
	{ label: 'int_', snippet: 'int_{${1:min}}^{${2:max}}', detail: '{}^{}', math: true },
	{ label: 'lim_', snippet: 'lim_{${1:min}}', detail: '{}', math: true },
	{ label: 'prod_', snippet: 'prod_{${1:min}}^{${2:max}}', detail: '{}^{}', math: true },
	{ label: 'sum_', snippet: 'sum_{${1:min}}^{${2:max}}', detail: '{}^{}', math: true },
	{ label: '\\', snippet: '\\', detail: 'line break' },
	{ label: '_', snippet: '_', detail: 'underscore' },
	{ label: '^', snippet: '^{${1}}', detail: 'circumflex accent' }
];
