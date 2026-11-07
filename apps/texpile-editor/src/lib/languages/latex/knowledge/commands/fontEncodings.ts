// the font encodings that set Latin letters as another script's (LGR sets a as α): what each slot shows and the ligatures of
// its font, and the commands that select an encoding
import commandsIndex from '../data/commands.json';
import type { EncodingTable } from '../types';
import { commonFacts } from './commandFacts';

const TABLES = (commandsIndex as unknown as { encodings: Record<string, EncodingTable> }).encodings;

/** the letter table of an encoding, or null for one that sets the letters it is typed with */
export function encodingTable(name: string): EncodingTable | null {
	return Object.hasOwn(TABLES, name) ? TABLES[name] : null;
}

/** the table of the encoding a command selects: for the rest of its group when it takes no argument, else for its argument */
export function encodingSelectedBy(command: string): EncodingTable | null {
	const name = commonFacts(command).encoding;
	return name ? encodingTable(name) : null;
}

/** whether the package data says the command selects a font encoding */
export function selectsEncoding(command: string): boolean {
	return !!commonFacts(command).encoding;
}
