import type { LibraryElement } from '$lib/draw/editor/figure/figureLanguage';

/** a document preamble with just what the element needs */
export function elementPreamble(e: LibraryElement) {
	return [
		'\\documentclass{article}\\usepackage{tikz}',
		e.usepackage && `\\usepackage{${e.usepackage}}`,
		e.usepackage === 'pgfplots' && '\\pgfplotsset{compat=1.18}',
		e.libraries.length && `\\usetikzlibrary{${e.libraries.join(',')}}`
	]
		.filter(Boolean)
		.join('\n');
}
