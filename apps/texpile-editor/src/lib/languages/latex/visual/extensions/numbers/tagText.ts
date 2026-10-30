// the \tag an equation gives itself: the text it prints in place of a number, read through nested braces and math
export type EquationTag = { starred: boolean; text: string | null };

const WORDS = /\\(?:text|textbf|textit|textrm|textsf|mathrm|mathbf|mathit|mathsf)\s*\{([^{}]*)\}/g;

function groupAt(text: string, from: number): string | null {
	if (text[from] !== '{') return null;
	let depth = 0;
	for (let i = from; i < text.length; i++) {
		if (text[i] === '\\') i++;
		else if (text[i] === '{') depth++;
		else if (text[i] === '}' && --depth === 0) return text.slice(from + 1, i);
	}
	return null;
}

// null when the tag holds a command the editor does not print
function plainTagText(source: string): string | null {
	const plain = source.replace(WORDS, '$1').replace(/\$/g, '').replace(/[{}]/g, '').trim();
	return plain && !plain.includes('\\') ? plain : null;
}

export function tagIn(code: string): EquationTag | null {
	const match = /\\tag(\*?)\s*(?=\{)/.exec(code);
	if (!match) return null;
	const body = groupAt(code, match.index + match[0].length);
	return body === null ? null : { starred: match[1] === '*', text: plainTagText(body) };
}
