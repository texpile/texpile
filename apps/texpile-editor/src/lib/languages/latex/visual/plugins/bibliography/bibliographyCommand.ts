export type BibliographyCommand = { style: boolean; value: string };

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
