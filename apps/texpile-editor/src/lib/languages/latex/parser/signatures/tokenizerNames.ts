// the environments the tokenizer reads as verbatim or as math: the common reading, under what the document and its
// loaded files say of a name; the tokenizer runs before anything else, and reading verbatim as TeX loses text
import { commonEnvFacts, commonEnvNames, hasMathBody, hasUnreadBody, type EnvFacts } from '../../knowledge/environments/envFacts';
import { tableEnvFacts } from './environmentFacts';
import type { PackageTable } from './packageTable';

export type TokenizerNames = { verbatimEnvs: string[]; verbatimOptionalArgEnvs: string[]; mathEnvs: string[] };

const byTable = new WeakMap<PackageTable, TokenizerNames>();
let common: TokenizerNames | null = null;

function longestFirst(names: Iterable<string>): string[] {
	return [...new Set(names)].sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
}

function namesFrom(candidates: string[], read: (name: string) => EnvFacts): TokenizerNames {
	const verbatim = longestFirst(candidates.filter((n) => hasUnreadBody(read(n))));
	// lstlisting[language=C]: the bracket is the environment's, the rest of the line its body
	const optional = verbatim.filter((n) => {
		const args = read(n).args;
		return args?.length === 1 && args[0].kind === 'o';
	});
	return {
		verbatimEnvs: verbatim.filter((n) => !optional.includes(n)),
		verbatimOptionalArgEnvs: optional,
		mathEnvs: longestFirst(candidates.filter((n) => hasMathBody(read(n))))
	};
}

/** `table`: the parse's, whose readings win for the names it has */
export function tokenizerNames(table?: PackageTable): TokenizerNames {
	common ??= namesFrom(
		commonEnvNames(() => true),
		commonEnvFacts
	);
	if (!table) return common;
	let names = byTable.get(table);
	if (!names) {
		const candidates = [...common.verbatimEnvs, ...common.verbatimOptionalArgEnvs, ...common.mathEnvs, ...Object.keys(table.bodies)];
		names = namesFrom(candidates, (n) => ({ ...tableEnvFacts(table, n), args: table.envs[n] ?? commonEnvFacts(n).args }));
		byTable.set(table, names);
	}
	return names;
}
