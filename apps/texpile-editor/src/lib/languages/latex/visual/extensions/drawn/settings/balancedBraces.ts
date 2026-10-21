/** every brace closed in order, escaped ones aside, so an argument's text cannot close its command early or leave it open */
export function balancedBraces(text: string): boolean {
	let depth = 0;
	for (let i = 0; i < text.length; i++) {
		// a trailing backslash escapes the closing brace, and a percent sign comments it out
		if (text[i] === '\\') {
			if (++i === text.length) return false;
		} else if (text[i] === '%') return false;
		else if (text[i] === '{') depth++;
		else if (text[i] === '}' && --depth < 0) return false;
	}
	return depth === 0;
}
