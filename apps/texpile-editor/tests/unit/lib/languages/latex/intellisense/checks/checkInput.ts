import { loadedPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { packageUseSitesIn } from '$lib/languages/latex/intellisense/packages/packageUses';
import { definedNamesIn, type DefinedNames } from '$lib/languages/latex/intellisense/checks/reading/definedNames';
import type { LatexCheckInput } from '$lib/languages/latex/intellisense/checks/latexChecks';
import { optionNamesOf } from '$lib/languages/latex/intellisense/checks/reading/optionNames';
import { possibleNamesOf } from '$lib/languages/latex/intellisense/checks/reading/possibleNames';
import type { Engine } from '$lib/workspace/compileCommand';

export const NOTHING_ELSEWHERE: DefinedNames = { names: new Set(), prefixes: [], dynamic: false };

export async function checkInput(
	text: string,
	options: { engine?: Engine | null; elsewhere?: string; local?: string[] } = {}
): Promise<LatexCheckInput> {
	const path = '/project/main.tex';
	const uses = packageUseSitesIn(text).map((use) => ({ ...use, path }));
	const loaded = await loadedPackages(uses.map(({ path: _path, at: _at, ...use }) => use));
	return {
		text,
		path,
		main: path,
		isMain: true,
		engine: options.engine ?? null,
		loaded,
		uses,
		elsewhere: options.elsewhere === undefined ? NOTHING_ELSEWHERE : definedNamesIn(options.elsewhere),
		local: new Set(options.local),
		options: await optionNamesOf(loaded),
		possible: await possibleNamesOf(loaded)
	};
}
