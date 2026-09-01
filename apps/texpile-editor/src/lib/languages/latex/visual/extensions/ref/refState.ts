import { refText } from './refText';

export type RefState = {
	/** what the chip prints */
	text: string;
	/** the compiler said this points at nothing */
	broken: boolean;
};

/**
 * What a \ref chip shows. Both answers come from the compiler; neither is inferred.
 *
 * The number is the \newlabel it wrote to the .aux, and with no answer there the label itself is
 * the honest display: counting the document was wrong for every structure the editor does not
 * model. Broken is its "Reference `x' undefined" warning, not our own failure to find the label,
 * which says nothing - the editor keeps environments raw and never parses the other project
 * files. The .aux is read first because a first compile calls every reference undefined in the
 * same run that defines them.
 */
export function refState(command: string, label: string, auxNumbers: Record<string, string>, undefinedRefs: ReadonlySet<string>): RefState {
	const number = auxNumbers[label];
	if (number !== undefined) return { text: refText(command, number), broken: false };
	return { text: label, broken: undefinedRefs.has(label) };
}
