import { loadsClass } from '$lib/languages/latex/intellisense/packages/loaderCommands';
import type { LoadedFile } from '$lib/languages/latex/knowledge/loadedFiles';
import { stackedCommands } from '$lib/languages/latex/knowledge/stackedEntries';

const SHAPES = ['plain', 'paren', 'text'];

/**
 * The citation commands a document can actually compile, from the files it loads (its class, its packages and what
 * they load in turn, as documentPackages gives them).
 *
 * The same three options are offered whichever package is in play; only the command underneath changes, so a natbib
 * document writes \citep where a biblatex one writes \parencite.
 *
 * \autocite is deliberately absent. It means what \cite already means here, let the style decide,
 * while being biblatex-only: the option that reads safest and travels worst. A document already
 * using it keeps it, because the form folds the chip's current variant back in.
 *
 * Returning undefined means "no preamble seen", which is an included chapter rather than a document without packages.
 * Narrowing there would collapse the menu in every multi-file project.
 */
export function citationVariantsFor(preamble: string, loaded: LoadedFile[]): string[] | undefined {
	if (!loadsClass(preamble)) return undefined;
	const order = new Map(loaded.map((file, i) => [file.id, i]));
	const cites = [...stackedCommands(loaded).values()].filter((c) => c.cite && c.offered);
	return SHAPES.flatMap((shape) => {
		const ofShape = cites.filter((c) => c.cite === shape);
		// the file loaded last decides, as its definition is the one in force
		const latest = Math.max(...ofShape.map((c) => order.get(c.from) ?? -1));
		const names = ofShape.filter((c) => order.get(c.from) === latest).map((c) => c.name);
		const plain = names.filter((name) => name === name.toLowerCase());
		return plain.length ? [plain.reduce((a, b) => (b.length < a.length ? b : a))] : [];
	});
}
