import { refText } from './refText';

export type RefState = {
	/** what the chip prints */
	text: string;
	/** the compiler said this points at nothing */
	broken: boolean;
};

/**
 * What a \ref chip shows: the number the editor draws on the figure, table, heading or equation the label is on, when
 * it counts that and is sure; else the \newlabel the compiler wrote to the .aux; with neither, the label itself.
 *
 * The editor's count comes first so the reference and the number on its target always agree, also before a compile and
 * after one the document has grown past. Broken is the compiler's "Reference `x' undefined" warning, not our own
 * failure to find the label, which says nothing - the editor keeps environments raw and never parses the other project
 * files. The .aux is read before the warning because a first compile calls every reference undefined in the same run
 * that defines them.
 */
export function refState(
	command: string,
	label: string,
	counted: string | undefined,
	auxNumbers: Record<string, string>,
	undefinedRefs: ReadonlySet<string>
): RefState {
	const number = counted ?? (Object.hasOwn(auxNumbers, label) ? auxNumbers[label] : undefined);
	if (number !== undefined) return { text: refText(command, number), broken: false };
	return { text: label, broken: undefinedRefs.has(label) };
}
