// hand-maintained key/value rules for argument slots the bundled package data does NOT carry
// (pagestyle/pagenumbering have no key groups in it). package-dependent slots live in
// packages/packageData.ts; add a rule here only when the data genuinely lacks the values.
export type ArgKeyRule = {
	name: string;
	/** matches text-to-cursor; must end right where the key list starts or continues. */
	trigger: RegExp;
	options: string[];
};

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
