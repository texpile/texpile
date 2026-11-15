// where each PDF was scrolled to, so a tab switched back to opens at the same place
export type PdfPlace = { page: number; fraction: number };

const KEPT = 30;
const places = new Map<string | number, PdfPlace>();

export function rememberPdfPlace(key: string | number, place: PdfPlace): void {
	places.delete(key);
	places.set(key, place);
	if (places.size > KEPT) places.delete(places.keys().next().value!);
}

export function pdfPlaceOf(key: string | number): PdfPlace | null {
	return places.get(key) ?? null;
}
