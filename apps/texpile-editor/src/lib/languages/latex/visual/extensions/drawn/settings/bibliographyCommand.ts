// \bibliographystyle or \bibliography as its one setting, the style or the .bib files, changed in place
import { loadsClass } from '$lib/languages/latex/intellisense/packages/loaderCommands';
import type { LoadedFile } from '$lib/languages/latex/knowledge/loadedFiles';
import { commonRegistry, loadedRegistry } from '$lib/languages/latex/knowledge/registries/registries';

export type BibliographyCommand = { style: boolean; value: string };

// the file that ships BibTeX's own styles
const BIBTEX_BASE = 'packages/bibtex';

/** the .bst styles the loaded files provide, then BibTeX's classic ones, then the ones the common packages and classes bring */
export function bibStyleNames(loaded: LoadedFile[]): string[] {
	const common = commonRegistry('bibStyles');
	const styles = [...loadedRegistry(loaded, 'bibStyles'), ...common.filter((style) => style.file === BIBTEX_BASE), ...common];
	return [...new Set(styles.map((style) => style.name))];
}

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
export function bibliographyKindFor(preamble: string, loaded: LoadedFile[]): 'biblatex' | 'bibtex' | undefined {
	if (!loadsClass(preamble)) return undefined;
	return loaded.some((file) => file.name === 'biblatex') ? 'biblatex' : 'bibtex';
}
