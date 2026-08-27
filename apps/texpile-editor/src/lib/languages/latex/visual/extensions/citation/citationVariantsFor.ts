import { detectedPackages } from '$lib/languages/latex/intellisense/completion/packageData';

/**
 * The citation commands a document can actually compile, read from what its preamble loads.
 *
 * The menu used to be a fixed biblatex list for everyone, so picking "Parenthetical" in a natbib
 * document wrote \parencite - an undefined command and a failed build. The same three options are
 * offered whichever package is in play; only the command underneath changes, so there is one thing
 * to learn rather than one per project.
 *
 * \autocite is deliberately absent. It means what \cite already means here, let the style decide,
 * while being biblatex-only: the option that reads safest and travels worst. A document already
 * using it keeps it, because the form folds the chip's current variant back in.
 *
 * Returning undefined means "no preamble seen", which is an included chapter rather than a
 * document without packages. Narrowing there would collapse the menu in every multi-file project,
 * so the caller keeps offering what it offered before.
 */
export function citationVariantsFor(preamble: string): string[] | undefined {
	if (!/\\documentclass/.test(preamble)) return undefined;

	const packages = detectedPackages(preamble);
	if (packages.has('biblatex')) return ['cite', 'parencite', 'textcite'];
	if (packages.has('natbib')) return ['cite', 'citep', 'citet'];
	// plain bibtex defines exactly one citation command, so there is no choice to offer
	return ['cite'];
}
