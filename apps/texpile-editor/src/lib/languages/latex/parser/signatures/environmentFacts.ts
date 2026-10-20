// what the document's loaded files say an environment's body is; a name none of them defines (a local .sty's) reads
// as most files give it
import { commonEnvFacts, type EnvFacts } from '../../knowledge/environments/envFacts';
import { BASE_PACKAGE_TABLE, type PackageTable } from './packageTable';

export function tableEnvFacts(table: PackageTable, name: string): EnvFacts {
	return table.bodies[name] ?? (name in table.envs ? {} : commonEnvFacts(name));
}

export function environmentFacts(options: { table?: PackageTable }, name: string): EnvFacts {
	return tableEnvFacts(options.table ?? BASE_PACKAGE_TABLE, name);
}
