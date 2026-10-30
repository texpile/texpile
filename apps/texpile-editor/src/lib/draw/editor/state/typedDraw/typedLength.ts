import { CM_PER_UNIT } from '../../figure/lengthUnits';

/** a typed length in cm: a number, cm by default, or one in mm, in, pt or bp, as a CAD dimension box takes it */
export function readTypedLength(text: string): number | null {
	const m = /^\s*(\d+[.,]?\d*|[.,]\d+)\s*([a-z]*)\s*$/i.exec(text);
	const unit = m ? CM_PER_UNIT[m[2].toLowerCase() || 'cm'] : undefined;
	return m && unit !== undefined ? Number(m[1].replace(',', '.')) * unit : null;
}

/** a typed angle in degrees, with or without its sign */
export function readTypedAngle(text: string): number | null {
	const m = /^\s*(-?(?:\d+[.,]?\d*|[.,]\d+))\s*°?\s*$/.exec(text);
	return m ? Number(m[1].replace(',', '.')) : null;
}
