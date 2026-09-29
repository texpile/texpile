// what TeX reads of a file: comments, verbatim text and \iffalse blocks blanked out

const OPAQUE_ENVS = /\\begin\{(verbatim\*?|lstlisting|minted|comment|filecontents\*?)\}[\s\S]*?\\end\{\1\}/g;

function blank(s: string): string {
	return s.replace(/[^\n]/g, ' ');
}

/** blanked with spaces, so offsets hold */
export function codeOnly(tex: string): string {
	return tex
		.replace(OPAQUE_ENVS, blank)
		.replace(/(^|[^\\])(%[^\n]*)/g, (_, lead: string, c: string) => lead + blank(c))
		.replace(/\\iffalse\b[\s\S]*?\\fi\b/g, blank);
}
