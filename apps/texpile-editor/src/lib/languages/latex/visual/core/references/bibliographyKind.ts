// how a document prints its bibliography, and the BibTeX styles its loaded files offer
import type { LoadedFile } from '$lib/languages/latex/knowledge/loadedFiles';
import { commonRegistry, loadedRegistry } from '$lib/languages/latex/knowledge/registries/registries';
import { loadsClass } from '$lib/languages/latex/intellisense/packages/loaderCommands';

// the file that ships BibTeX's own styles
const BIBTEX_BASE = 'packages/bibtex';

/** the .bst styles the loaded files provide, then BibTeX's classic ones, then the ones the common packages and classes bring */
export function bibStyleNames(loaded: LoadedFile[]): string[] {
	const common = commonRegistry('bibStyles');
	const styles = [...loadedRegistry(loaded, 'bibStyles'), ...common.filter((style) => style.file === BIBTEX_BASE), ...common];
	return [...new Set(styles.map((style) => style.name))];
}

/** how the preamble prints its bibliography: biblatex's \printbibliography, or BibTeX's style and files. undefined = no preamble seen */
export function bibliographyKindFor(preamble: string, loaded: LoadedFile[]): 'biblatex' | 'bibtex' | undefined {
	if (!loadsClass(preamble)) return undefined;
	return loaded.some((file) => file.name === 'biblatex') ? 'biblatex' : 'bibtex';
}
