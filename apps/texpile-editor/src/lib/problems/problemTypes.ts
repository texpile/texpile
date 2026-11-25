// one row of the Problems tab, whichever check found it
export const PROBLEM_FILTERS = ['error', 'warning', 'spelling', 'grammar', 'style', 'reference', 'box'] as const;
export type ProblemFilter = (typeof PROBLEM_FILTERS)[number];

/** label: what the text becomes, or what the fix does */
export type ProblemFix = { label: string; apply: () => Promise<void> };

export type Problem = {
	filter: ProblemFilter;
	/** absolute; null when the compile named no file, outside when it names one outside the folder */
	file: string | null;
	outside?: boolean;
	/** 1-based */
	line: number | null;
	message: string;
	hint?: string;
	/** the tool that reported it (biber, dvipdfmx) */
	source?: string;
	/** the words it is about, selected by a jump */
	words?: string;
	fix?: ProblemFix;
	/** what Ignore remembers it by; null when it cannot be ignored */
	ignoreKey: string | null;
};
