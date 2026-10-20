import { commonRegistry } from './registries';

/** whether the column letter works in the table environment (X in tabularx); a letter no file defines works in none */
export function columnTypeWorksIn(letter: string, environment: string): boolean {
	return commonRegistry('columnTypes').some((t) => t.name === letter && (!t.in || t.in.includes(environment)));
}
