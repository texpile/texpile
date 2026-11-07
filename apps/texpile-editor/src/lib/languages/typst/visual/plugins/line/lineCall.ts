// a chip that is one call of a straight line along the column
import { readStdUse, type StdUse } from '$lib/languages/typst/visual/core/document';

const ACROSS = ['start', 'end', 'angle'];

/** a chip that is one call of a straight line along the column */
export function readLine(source: string): StdUse | null {
	const use = readStdUse(source);
	const params = use?.entry.params?.map((param) => param.name) ?? [];
	if (!use || use.entry.group !== 'visualize' || !params.includes('length') || !params.includes('angle')) return null;
	return use.call.bodies.length || use.call.args.some((arg) => arg.name === null || ACROSS.includes(arg.name)) ? null : use;
}
