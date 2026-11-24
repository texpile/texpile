import { printedName } from '../../extensions/environment/environmentHeads';

export function floatName(float: string): string {
	return printedName(float, undefined) ?? float.charAt(0).toUpperCase() + float.slice(1);
}

/** on a caption head drawn outside a float it knows: the float drawing it names it */
export const FLOAT_HEAD = 'data-float-head';
