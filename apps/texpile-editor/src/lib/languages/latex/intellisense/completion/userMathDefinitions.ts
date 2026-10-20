// the document's own commands and environments that carry math delimiters: this buffer's, then the other project files'
import { projectIntelStore, type ProjectIntel } from '$lib/stores/projectIntel';
import { userDefinitionsOf } from './macros';
import { mathBearingNames, type UserDefinitions, type UserEnvironmentDef, type UserMacroDef } from './userMacroScan';
import type { UserMathDefinitions } from './mathScan';

type ProjectLookups = {
	macros: Map<string, { body: string; takesArguments: boolean }>;
	environments: Map<string, { begin: string; end: string }>;
};

let projectCache: { intel: ProjectIntel; lookups: ProjectLookups } | null = null;

function projectLookups(): ProjectLookups {
	const intel = projectIntelStore.current;
	if (projectCache?.intel === intel) return projectCache.lookups;
	const macros = intel.macros.filter((m) => m.definition !== undefined);
	const environments = intel.envs.filter((e) => e.definition !== undefined);
	const bearing = mathBearingNames([
		...macros.map((m) => ({ name: m.name, text: m.definition ?? '' })),
		...environments.map((e) => ({ name: e.name, text: `${e.definition}${e.end ?? ''}` }))
	]);
	const lookups: ProjectLookups = {
		macros: new Map(
			macros.filter((m) => bearing.has(m.name)).map((m) => [m.name, { body: m.definition ?? '', takesArguments: m.signature !== '' }])
		),
		environments: new Map(
			environments.filter((e) => bearing.has(e.name)).map((e) => [e.name, { begin: e.definition ?? '', end: e.end ?? '' }])
		)
	};
	projectCache = { intel, lookups };
	return lookups;
}

const bufferLookups = new WeakMap<UserDefinitions, { macros: Map<string, UserMacroDef>; environments: Map<string, UserEnvironmentDef> }>();

function lookupsOf(buffer: UserDefinitions | null) {
	if (!buffer) return { macros: new Map<string, UserMacroDef>(), environments: new Map<string, UserEnvironmentDef>() };
	let found = bufferLookups.get(buffer);
	if (!found) {
		found = { macros: new Map(buffer.macros.map((d) => [d.name, d])), environments: new Map(buffer.environments.map((d) => [d.name, d])) };
		bufferLookups.set(buffer, found);
	}
	return found;
}

/** a name the buffer defines is the buffer's, whatever the project says */
export function userMathDefinitions(text: string): UserMathDefinitions {
	const { macros: bufferMacros, environments: bufferEnvironments } = lookupsOf(userDefinitionsOf(text));
	return {
		macro(name) {
			const own = bufferMacros.get(name);
			if (own) return own.body === undefined ? null : { body: own.body, takesArguments: own.signature !== '' };
			return projectLookups().macros.get(name) ?? null;
		},
		environment(name) {
			const own = bufferEnvironments.get(name);
			if (own) return own.begin === undefined ? null : { begin: own.begin, end: own.end ?? '' };
			return projectLookups().environments.get(name) ?? null;
		}
	};
}
