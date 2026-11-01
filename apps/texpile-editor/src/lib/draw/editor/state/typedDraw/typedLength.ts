import { CM_PER_UNIT } from '../../figure/lengthUnits';

export function readTypedLength(text: string): number | null {
	const m = /^\s*(\d+[.,]?\d*|[.,]\d+)\s*([a-z]*)\s*$/i.exec(text);
	const unit = m ? CM_PER_UNIT[m[2].toLowerCase() || 'cm'] : undefined;
	return m && unit !== undefined ? Number(m[1].replace(',', '.')) * unit : null;
}

export function readTypedAngle(text: string): number | null {
	const m = /^\s*(-?(?:\d+[.,]?\d*|[.,]\d+))\s*°?\s*$/.exec(text);
	return m ? Number(m[1].replace(',', '.')) : null;
}
