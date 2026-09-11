// A quote is a raw slice of source, newlines and indentation included, so it renders as a ragged
export function oneLine(s: string, max = 90): string {
	const flat = s.replace(/\s+/g, ' ').trim();
	return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}
