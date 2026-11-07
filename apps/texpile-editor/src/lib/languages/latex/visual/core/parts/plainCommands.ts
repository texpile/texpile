// a command with no arguments that prints no text: a setting the package data says it declares or prints nothing
import { drawnName, SWITCHES } from '$lib/languages/latex/drawnCommands';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';

export function declaresSetting(name: string): boolean {
	return commonFacts(name).declares != null;
}

export function printsNothing(name: string): boolean {
	return commonFacts(name).prints === '';
}

/** a name the data gives a reading of its own, which a definition the editor cannot draw gives way to */
export function readsAsData(name: string): boolean {
	return drawnName(name) || Object.hasOwn(SWITCHES, name) || declaresSetting(name) || printsNothing(name);
}
