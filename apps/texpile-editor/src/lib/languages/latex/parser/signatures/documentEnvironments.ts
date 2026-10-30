// the environments a document defines itself read as it defines them, over any package's reading of the name
import { codeOnly } from '../../texCode';
import { definedEnvironmentBodies } from '../../userDefinitions';
import type { EnvFacts } from '../../knowledge/environments/envFacts';
import { BASE_PACKAGE_TABLE, type PackageTable } from './packageTable';

const withDefined = new WeakMap<PackageTable, Map<string, PackageTable>>();

/** the table with each environment `text` defines given the body its definer makes, or no body reading */
export function withDocumentEnvironments(table: PackageTable | undefined, text: string): PackageTable {
	const base = table ?? BASE_PACKAGE_TABLE;
	const bodies: [string, EnvFacts][] = [...definedEnvironmentBodies(codeOnly(text))]
		.map(([name, body]): [string, EnvFacts] => [name, body ? { body } : {}])
		.filter(([name, facts]) => JSON.stringify(base.bodies[name]) !== JSON.stringify(facts));
	if (!bodies.length) return base;
	const key = bodies
		.map(([name, facts]) => `${name}:${facts.body ?? ''}`)
		.sort()
		.join(' ');
	const cached = withDefined.get(base)?.get(key);
	if (cached) return cached;
	const out = { ...base, bodies: { ...base.bodies, ...Object.fromEntries(bodies) } };
	if (!withDefined.has(base)) withDefined.set(base, new Map());
	withDefined.get(base)!.set(key, out);
	return out;
}
