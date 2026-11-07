import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import type { Look } from '$lib/languages/latex/drawnCommands';

export function declaredLook(name: string, values: string[]): Look {
	const factor = values.length === 1 ? Number(values[0].trim()) : NaN;
	return commonFacts(name).declares === 'size' && factor > 0 && factor < 10 ? { fontSize: `${factor}em` } : {};
}
