import type { ProjectDef } from '$lib/stores/projectIntel';
import { commonEnvFacts } from '../../knowledge/environments/envFacts';
import { mathBearingNames, type UserDefinitions } from '../../intellisense/completion/userMacroScan';
import { scanMath, type UserMathDefinitions } from './mathScan';

/** wrappers: commands whose arguments their definition puts in math, or out of it */
export type OwnMath = { opens: Set<string>; closes: Set<string>; environments: Set<string>; wrappers: Set<string> };

export const NO_OWN_MATH: OwnMath = { opens: new Set(), closes: new Set(), environments: new Set(), wrappers: new Set() };

export type ProjectDefinitions = { macros: ProjectDef[]; envs: ProjectDef[] };

type MacroBody = { body: string; takesArguments: boolean };
type EnvironmentCode = { begin: string; end: string };

function definitionsOf(buffer: UserDefinitions, project: ProjectDefinitions) {
	const macros = new Map<string, MacroBody | null>();
	const environments = new Map<string, EnvironmentCode | null>();
	for (const d of buffer.macros) macros.set(d.name, d.body === undefined ? null : { body: d.body, takesArguments: d.signature !== '' });
	for (const e of buffer.environments) environments.set(e.name, e.begin === undefined ? null : { begin: e.begin, end: e.end ?? '' });
	const bearing = mathBearingNames([
		...project.macros.map((d) => ({ name: d.name, text: d.definition ?? '' })),
		...project.envs.map((e) => ({ name: e.name, text: `${e.definition ?? ''}${e.end ?? ''}` }))
	]);
	for (const d of project.macros)
		if (!macros.has(d.name) && d.definition !== undefined && bearing.has(d.name))
			macros.set(d.name, { body: d.definition, takesArguments: d.signature !== '' });
	for (const e of project.envs)
		if (!environments.has(e.name) && e.definition !== undefined && bearing.has(e.name))
			environments.set(e.name, { begin: e.definition, end: e.end ?? '' });
	return { macros, environments };
}

export function ownMathOf(buffer: UserDefinitions, project: ProjectDefinitions = { macros: [], envs: [] }): OwnMath {
	const { macros, environments } = definitionsOf(buffer, project);
	const lookup: UserMathDefinitions = {
		macro: (name) => macros.get(name) ?? null,
		environment: (name) => environments.get(name) ?? null
	};
	const own: OwnMath = { opens: new Set(), closes: new Set(), environments: new Set(), wrappers: new Set() };
	for (const [name, macro] of macros) {
		if (!macro) continue;
		if (macro.takesArguments) {
			own.wrappers.add(name);
			continue;
		}
		const scan = scanMath(macro.body, commonEnvFacts, lookup);
		if (scan.math) own.opens.add(name);
		else if (!scan.sound) own.closes.add(name);
	}
	for (const [name, code] of environments) if (code && scanMath(code.begin, commonEnvFacts, lookup).math) own.environments.add(name);
	return own;
}

export function ownMathTokensKey(own: OwnMath): string {
	return ownMathKey({ ...NO_OWN_MATH, opens: own.opens, closes: own.closes });
}

export function ownMathKey(own: OwnMath): string {
	return [own.opens, own.closes, own.environments, own.wrappers].map((names) => [...names].sort().join(',')).join(';');
}
