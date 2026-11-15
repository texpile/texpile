// The environment a document was still inside at \end{document}, as LaTeX's own error line names it.

export type OpenEnvironment = { name: string; line: number };

export function openEnvironment(log: string): OpenEnvironment | null {
	// TeX wraps its log lines, and a long name puts the error on two
	const said = /\\begin\{([^}]+)\} on input line (\d+) ended by \\end\{document\}/.exec(log.replace(/\r?\n/g, ''));
	return said ? { name: said[1], line: Number(said[2]) } : null;
}
