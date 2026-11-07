/** the width a typed column argument stands for; null while it is empty or its braces are open */
export function readColumnWidth(text: string): string | null {
	const width = text.trim();
	let depth = 0;
	for (let i = 0; i < width.length; i++) {
		if (width[i] === '\\') i++;
		else if (width[i] === '{') depth++;
		else if (width[i] === '}' && --depth < 0) return null;
	}
	return width && depth === 0 ? width : null;
}
