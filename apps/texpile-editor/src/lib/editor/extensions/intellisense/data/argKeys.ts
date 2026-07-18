// hand-maintained key/value rules for argument slots the vendored LaTeX Workshop package data
// does NOT carry (verified by scratchpad/gen-packages.mjs coverage probe: pagestyle/pagenumbering
// have no key groups anywhere in LW's data). package-dependent slots live in
// completion/packageData.ts; add a rule here only when the data genuinely lacks the values.
export interface ArgKeyRule {
	name: string;
	/** matches text-to-cursor; must end right where the key list starts or continues. */
	trigger: RegExp;
	options: string[];
}

export const ARG_KEY_RULES: ArgKeyRule[] = [
	{
		name: 'pagestyle',
		trigger: /\\(?:pagestyle|thispagestyle)\{[^{}]*$/,
		options: ['empty', 'plain', 'headings', 'myheadings', 'fancy']
	},
	{
		name: 'pagenumbering',
		trigger: /\\pagenumbering\{[^{}]*$/,
		options: ['arabic', 'roman', 'Roman', 'alph', 'Alph', 'gobble']
	}
];
