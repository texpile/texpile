// what an environment's body is: from the open file's loaded files when the caller has them, else the reading most
// files that define the name give
import envFactsIndex from '../data/env-facts.json';
import type { LoadedFile } from '../loadedFiles';
import { stackedEnvironments } from '../stackedEntries';
import type { EnvironmentFields } from '../types';

export type EnvBody = NonNullable<EnvironmentFields['body']>;
/** args: in the common reading only, a verbatim environment's own arguments */
export type EnvFacts = {
	body?: EnvBody;
	cells?: true;
	rows?: true;
	item?: string[];
	numbering?: 'per-row' | 'single';
	in?: 'math';
	labels?: true;
	args?: { kind: string }[];
};

const INDEX = (envFactsIndex as { envs: Record<string, EnvFacts> }).envs;
const NONE: EnvFacts = {};
const FIELDS = ['body', 'cells', 'rows', 'item', 'numbering', 'in', 'labels'] as const;

/** the reading most files that define the environment give; {} for one no file reads specially */
export function commonEnvFacts(name: string): EnvFacts {
	return INDEX[name] ?? NONE;
}

/** the environments whose common reading passes `test`, longest name first */
export function commonEnvNames(test: (facts: EnvFacts) => boolean): string[] {
	return Object.keys(INDEX)
		.filter((n) => test(INDEX[n]))
		.sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
}

/** the names as one regex alternation */
export function envNameAlternation(names: string[]): string {
	return names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
}

/** the facts the loaded files give each environment, stars as their own names */
export function loadedEnvFacts(loaded: LoadedFile[]): Record<string, EnvFacts> {
	const out: Record<string, EnvFacts> = {};
	for (const [name, e] of stackedEnvironments(loaded)) {
		const facts: EnvFacts = {};
		for (const f of FIELDS) if (e[f] != null) Object.assign(facts, { [f]: e[f] });
		if (Object.keys(facts).length) out[name] = facts;
	}
	return out;
}

export function hasMathBody(facts: EnvFacts): boolean {
	return facts.body === 'math-display' || facts.body === 'math-inline';
}

/** a math body, or valid only inside math (cases, pmatrix) */
export function holdsMath(facts: EnvFacts): boolean {
	return hasMathBody(facts) || facts.in === 'math';
}

/** a body TeX reads no command in: verbatim text or a skipped one */
export function hasUnreadBody(facts: EnvFacts): boolean {
	return facts.body === 'verbatim' || facts.body === 'comment';
}

/** taken as written: verbatim, alltt or skipped */
export function hasLiteralBody(facts: EnvFacts): boolean {
	return hasUnreadBody(facts) || facts.body === 'literal';
}

let itemCommands: Set<string> | null = null;

/** a command that starts an entry of some list (\item, \bibitem) */
export function isItemCommand(name: string): boolean {
	itemCommands ??= new Set(Object.values(INDEX).flatMap((f) => f.item ?? []));
	return itemCommands.has(name);
}
