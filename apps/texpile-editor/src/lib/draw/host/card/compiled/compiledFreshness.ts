// the PDF shows the sources as they were compiled, so it must postdate every file the picture came through
export function isPdfCurrent(pdfMtimeMs: number, sourceMtimesMs: readonly number[]): boolean {
	return sourceMtimesMs.every((t) => pdfMtimeMs >= t);
}

export type ShownPicture<D, C> = { svg: D | null; compiled: C | null };

// a drawing made after the compile wins: the figure tab has seen the picture more recently than the PDF
export function chooseShown<D, C>(svg: D | null, drawnAtMs: number, compiled: C | null, pdfMtimeMs: number): ShownPicture<D, C> {
	if (compiled && (!svg || drawnAtMs < pdfMtimeMs)) return { svg: null, compiled };
	return { svg, compiled: null };
}
