import { printedName } from '../../extensions/environment/environmentHeads';

/** the word \<float>name prints, else the float type's own name */
export function floatName(float: string): string {
	return printedName(float, undefined) ?? float.charAt(0).toUpperCase() + float.slice(1);
}
