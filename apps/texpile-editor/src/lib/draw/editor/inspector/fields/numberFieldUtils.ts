export function readNumber(text: string) {
	const v = Number(text.trim().replace(',', '.'));
	return text.trim() && Number.isFinite(v) ? v : null;
}
