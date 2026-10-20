import { commonCommand, type IndexReading } from '../../knowledge/calls/commandCalls';
import { loadedReading } from '../../knowledge/calls/loadedReadings';
import type { LoadedFile } from '../../knowledge/loadedFiles';
import { userMacroSignature } from '../completion/macros';
import { readingOfSignature } from './argumentSlots';

/** how the open document reads `name`: a package it loads, then its own definition, then the common index */
export function documentReading(loaded: LoadedFile[] | null, text: string, name: string): IndexReading | null {
	const known = loadedReading(loaded, name);
	if (known) return known;
	const signature = userMacroSignature(text, name);
	return signature === null ? commonCommand(name) : readingOfSignature(signature);
}
