import { printedName } from '../../extensions/environment/environmentHeads';

export function floatName(float: string): string {
	return printedName(float, undefined) ?? float.charAt(0).toUpperCase() + float.slice(1);
}
