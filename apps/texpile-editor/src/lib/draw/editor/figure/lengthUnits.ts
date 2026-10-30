// TeX's point is 1/72.27 in, PostScript's big point (the canvas's unit) 1/72 in
const CM_PER_INCH = 2.54;
const PT_PER_INCH = 72.27;
const BP_PER_INCH = 72;

export const BP_PER_PT = BP_PER_INCH / PT_PER_INCH;
export const BP_PER_CM = BP_PER_INCH / CM_PER_INCH;
export const CM_PER_UNIT: Readonly<Record<string, number>> = {
	cm: 1,
	mm: 0.1,
	pt: CM_PER_INCH / PT_PER_INCH,
	bp: CM_PER_INCH / BP_PER_INCH,
	in: CM_PER_INCH
};
