import { drawnName, SWITCHES } from '$lib/languages/latex/drawnCommands';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';

export function declaresSetting(name: string): boolean {
	return commonFacts(name).declares != null;
}

export function printsNothing(name: string): boolean {
	return commonFacts(name).prints === '';
}

export function readsAsData(name: string): boolean {
	return drawnName(name) || Object.hasOwn(SWITCHES, name) || declaresSetting(name) || printsNothing(name);
}
