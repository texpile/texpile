// encodings that set Latin letters as another script's (LGR sets a as α)
import commandsIndex from '../data/commands.json';
import type { EncodingTable } from '../types';
import { commonFacts } from './commandFacts';

const TABLES = (commandsIndex as unknown as { encodings: Record<string, EncodingTable> }).encodings;

export function encodingTable(name: string): EncodingTable | null {
	return Object.hasOwn(TABLES, name) ? TABLES[name] : null;
}

export function encodingSelectedBy(command: string): EncodingTable | null {
	const name = commonFacts(command).encoding;
	return name ? encodingTable(name) : null;
}

export function selectsEncoding(command: string): boolean {
	return !!commonFacts(command).encoding;
}
