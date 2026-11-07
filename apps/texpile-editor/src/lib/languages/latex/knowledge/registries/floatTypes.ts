import { commonRegistry } from './registries';

let types: Set<string> | null = null;

export function floatTypes(): ReadonlySet<string> {
	types ??= new Set(commonRegistry('floats').map((f) => f.name));
	return types;
}
