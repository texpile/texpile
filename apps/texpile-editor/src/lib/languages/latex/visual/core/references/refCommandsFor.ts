import { loadsClass } from '$lib/languages/latex/intellisense/packages/loaderCommands';
import type { LoadedFile } from '$lib/languages/latex/knowledge/loadedFiles';
import { stackedCommands } from '$lib/languages/latex/knowledge/stackedEntries';

const OFFERED = ['ref', 'eqref', 'pageref', 'cref', 'Cref', 'autoref', 'nameref'];

/**
 * The reference commands a document can compile, from the files it loads, so the reference panel never offers \cref to a
 * paper without cleveref. Undefined when there is no preamble (an included chapter), where nothing narrows.
 */
export function refCommandsFor(preamble: string, loaded: LoadedFile[]): string[] | undefined {
	if (!loadsClass(preamble)) return undefined;
	const defined = stackedCommands(loaded);
	return OFFERED.filter((name) => defined.get(name)?.offered);
}

/** the reference commands the loaded files give a star; undefined when there is no preamble */
export function starredRefCommands(preamble: string, loaded: LoadedFile[]): string[] | undefined {
	if (!loadsClass(preamble)) return undefined;
	const defined = stackedCommands(loaded);
	return OFFERED.filter((name) => defined.get(name)?.starred);
}
