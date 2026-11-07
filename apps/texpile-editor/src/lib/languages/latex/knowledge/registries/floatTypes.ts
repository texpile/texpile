// the float types the loaded files of the arXiv sample declare (figure, table, algorithm, listing); each numbers its
// captions in a counter of its name
import { commonRegistry } from './registries';

let types: Set<string> | null = null;

export function floatTypes(): ReadonlySet<string> {
	types ??= new Set(commonRegistry('floats').map((f) => f.name));
	return types;
}
