// where the Typst preview was scrolled and zoomed, so a frame built again (resume, theme, pop out) opens there
export type TypstPreviewPlace = { ratio: number; page: number; frac: number; left: number };

let saved: { file: string; place: TypstPreviewPlace } | null = null;

export function rememberPreviewPlace(file: string | null, place: unknown): void {
	if (file && isPlace(place)) saved = { file, place };
}

export function previewPlaceFor(file: string | null): TypstPreviewPlace | null {
	return saved && file && saved.file === file ? saved.place : null;
}

function isPlace(v: unknown): v is TypstPreviewPlace {
	if (!v || typeof v !== 'object') return false;
	const p = v as Record<string, unknown>;
	return [p.ratio, p.page, p.frac, p.left].every((n) => typeof n === 'number' && Number.isFinite(n));
}
