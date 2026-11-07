import { commonCommand } from '../calls/commandCalls';
import { commandsWith, commonFacts } from './commandFacts';

export type CommandExpansion = { name: string; params: number; body: string };

let expansions: CommandExpansion[] | null = null;

export function commandExpansions(): CommandExpansion[] {
	expansions ??= commandsWith('expands').map((name) => ({
		name,
		params: commonCommand(name)?.args.length ?? 0,
		body: commonFacts(name).expands ?? ''
	}));
	return expansions;
}
