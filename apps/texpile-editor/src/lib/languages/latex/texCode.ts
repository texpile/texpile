// what TeX reads of a file: comments, verbatim text and \iffalse blocks blanked out

const OPAQUE_ENVS =
	/\\begin\{(verbatim\*?|Verbatim\*?|BVerbatim|LVerbatim|lstlisting|minted|comment|filecontents\*?)\}[\s\S]*?\\end\{\1\}/g;

function blank(s: string): string {
	return s.replace(/[^\n]/g, ' ');
}

/** blanked with spaces, so offsets hold */
export function codeOnly(tex: string): string {
	return (
		tex
			.replace(OPAQUE_ENVS, blank)
			.replace(/\\verb\*?([^\sA-Za-z*])[^\n]*?\1/g, blank)
			// a % after an even run of backslashes (\\% is a line break, then a comment)
			.replace(/(^|[^\\])((?:\\\\)*)(%[^\n]*)/g, (_, lead: string, breaks: string, c: string) => lead + breaks + blank(c))
			.replace(/\\iffalse\b[\s\S]*?\\fi\b/g, blank)
	);
}
