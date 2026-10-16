/**
 * The reference commands a document can compile, from what it loads (its class and packages with what they load), so
 * the reference panel never offers \cref to a paper without cleveref. Undefined when there is no preamble (an included
 * chapter), where nothing narrows.
 */
export function refCommandsFor(preamble: string, packages: ReadonlySet<string>): string[] | undefined {
	if (!/\\documentclass/.test(preamble)) return undefined;
	function has(...names: string[]): boolean {
		return names.some((name) => packages.has(name));
	}
	return [
		'ref',
		...(has('amsmath') ? ['eqref'] : []),
		'pageref',
		...(has('cleveref') ? ['cref', 'Cref'] : []),
		...(has('hyperref') ? ['autoref'] : []),
		...(has('nameref') ? ['nameref'] : [])
	];
}
