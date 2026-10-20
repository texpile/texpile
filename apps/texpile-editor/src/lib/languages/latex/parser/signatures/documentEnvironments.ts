// the environments a document defines itself read as it defines them, over any package's reading of the name
import { codeOnly } from '../../texCode';
import { definedIn } from '../../userDefinitions';
import { BASE_PACKAGE_TABLE, type PackageTable } from './packageTable';

// a renewed environment keeps the reading of what it wraps (\renewenvironment{equation} is still math)
export function definedEnvironmentNames(text: string): string[] {
	return [
		...new Set(
			definedIn(codeOnly(text), 'environment')
				.filter((d) => d.defines !== 'renew')
				.map((d) => d.name)
		)
	];
}

const withDefined = new WeakMap<PackageTable, Map<string, PackageTable>>();

/** the table with each environment `text` defines given no body reading */
export function withDocumentEnvironments(table: PackageTable | undefined, text: string): PackageTable {
	const base = table ?? BASE_PACKAGE_TABLE;
	const names = definedEnvironmentNames(text).filter((n) => base.bodies[n] === undefined || Object.keys(base.bodies[n]).length);
	if (!names.length) return base;
	const key = names.sort().join(' ');
	const cached = withDefined.get(base)?.get(key);
	if (cached) return cached;
	const out = { ...base, bodies: { ...base.bodies, ...Object.fromEntries(names.map((n) => [n, {}])) } };
	if (!withDefined.has(base)) withDefined.set(base, new Map());
	withDefined.get(base)!.set(key, out);
	return out;
}
