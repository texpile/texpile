export type MacroDefinition = {
	name: string;
	/** xparse-style argument spec: `m m`, `o m`, or empty */
	signature: string;
	index: number;
	/** \renewcommand and the like: changes a command that exists, defines nothing new */
	redefines: boolean;
};

// \newcommand family + the forms LaTeX Workshop parses beyond it. `\newcommand{\x}[2][d]` makes
// the first of its two arguments optional, so the default's bracket is captured too
const DEFINITION_FORMS: Array<{ re: RegExp; sig: (m: RegExpExecArray) => string }> = [
	{
		re: /\\(new|renew|provide)command\*?\s*\{?\\([a-zA-Z@]+)\}?(?:\s*\[(\d)\](\s*\[)?)?/g,
		sig: (m) => argSpec(+(m[3] ?? 0), !!m[4])
	},
	{
		re: /\\(New|Renew|Provide|Declare)(?:Expandable)?DocumentCommand\s*\{?\\([a-zA-Z@]+)\}?\s*\{([^{}]*)\}/g,
		sig: (m) => m[3].trim()
	},
	{ re: /\\(Declare)MathOperator\*?\{\\([a-zA-Z@]+)\}/g, sig: () => '' },
	{ re: /\\(Declare)PairedDelimiter(?:XPP|X)?\{?\\([a-zA-Z@]+)\}?/g, sig: () => 'm' },
	{
		re: /\\((?:re)?new)robustcmd\*?\s*\{\\([a-zA-Z@]+)\}(?:\[(\d)\](\s*\[)?)?/g,
		sig: (m) => argSpec(+(m[3] ?? 0), !!m[4])
	},
	{
		re: /\\(Declare)RobustCommand\*?\s*\{?\\([a-zA-Z@]+)\}?(?:\s*\[(\d)\](\s*\[)?)?/g,
		sig: (m) => argSpec(+(m[3] ?? 0), !!m[4])
	}
];

function argSpec(count: number, firstOptional: boolean): string {
	const args = Array.from({ length: count }, () => 'm');
	if (firstOptional && count > 0) args[0] = 'o';
	return args.join(' ');
}

/** the commands a TeX source defines, in the order of the forms above */
export function macroDefinitionsIn(text: string): MacroDefinition[] {
	const out: MacroDefinition[] = [];
	for (const { re, sig } of DEFINITION_FORMS) {
		re.lastIndex = 0;
		for (let m = re.exec(text); m; m = re.exec(text)) {
			out.push({ name: m[2], signature: sig(m), index: m.index, redefines: /^renew/i.test(m[1]) });
		}
	}
	return out;
}
