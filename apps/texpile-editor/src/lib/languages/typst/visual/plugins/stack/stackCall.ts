// a chip that is one call laying children out in a direction, and the direction it names
import { namedArg, type CallArg, readStdUse, type StdUse } from '$lib/languages/typst/visual/core/document';

export const DIRECTIONS: Record<string, string> = { ltr: 'row', rtl: 'row-reverse', ttb: 'column', btt: 'column-reverse' };

export function readStack(source: string): { use: StdUse; direction: CallArg | null } | null {
	const use = readStdUse(source);
	const names = use?.entry.params?.map((param) => param.name) ?? [];
	if (!use || !names.includes('dir') || !names.includes('children') || use.call.bodies.length) return null;
	const direction = namedArg(use.call, 'dir');
	return direction && !Object.hasOwn(DIRECTIONS, direction.value) ? null : { use, direction };
}
