// \bibliographystyle or \bibliography as its one setting, the style or the .bib files, changed in place

export type BibliographyCommand = { style: boolean; value: string };

export const BIB_STYLES = [
	'plain',
	'unsrt',
	'alpha',
	'abbrv',
	'ieeetr',
	'acm',
	'siam',
	'apalike',
	'plainnat',
	'unsrtnat',
	'abbrvnat',
	'IEEEtran'
];

/** the project's .bib files as \bibliography names them, without .bib */
export function bibFileNames(entries: Array<{ file: string }>): string[] {
	return [...new Set(entries.map((entry) => entry.file.replace(/^.*[\\/]/, '').replace(/\.bib$/i, '')))];
}

const BIBLIOGRAPHY = /^(\s*\\bibliography(style)?\{)([^{}]*)(\}\s*)$/;

export function readBibliography(source: string): BibliographyCommand | null {
	const match = BIBLIOGRAPHY.exec(source);
	return match ? { style: match[2] !== undefined, value: match[3] } : null;
}

export function writeBibliography(source: string, value: string): string {
	return source.replace(BIBLIOGRAPHY, (_, open: string, _style: string, _value: string, close: string) => open + value + close);
}

/** how the preamble prints its bibliography: biblatex's \printbibliography, or BibTeX's style and files. undefined = no preamble seen */
export function bibliographyKindFor(preamble: string, packages: ReadonlySet<string>): 'biblatex' | 'bibtex' | undefined {
	if (!/\\documentclass/.test(preamble)) return undefined;
	return packages.has('biblatex') ? 'biblatex' : 'bibtex';
}
