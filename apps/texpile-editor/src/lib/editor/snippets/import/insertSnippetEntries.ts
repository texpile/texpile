import type { SnippetEntry } from './latexSuite';

/** where entries go: the start of "snippets", or of the whole object in a bare VS Code file */
function insertionPoint(text: string): { at: number; indent: string } {
	let depth = 0;
	let top = -1;
	let key: string | null = null;
	let valueOfSnippets = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === '/' && text[i + 1] === '/') {
			i = text.indexOf('\n', i);
			if (i < 0) break;
		} else if (c === '/' && text[i + 1] === '*') {
			i = text.indexOf('*/', i + 2) + 1;
			if (i <= 0) break;
		} else if (c === '"') {
			let j = i + 1;
			while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
			key = depth === 1 ? text.slice(i + 1, j) : null;
			i = j;
		} else if (c === ':') valueOfSnippets = key === 'snippets';
		else if (!/\s/.test(c)) {
			if (c === '{' && depth === 1 && valueOfSnippets) return { at: i + 1, indent: '\t\t' };
			if (c === '{' && depth === 0) top = i;
			if (c === '{' || c === '[') depth++;
			else if (c === '}' || c === ']') depth--;
			key = null;
			valueOfSnippets = false;
		}
	}
	if (top < 0) throw new Error('the snippet file is not a JSON object');
	return { at: top + 1, indent: '\t' };
}

/** the file with the entries added at the top, so the ones already there win a clash of names */
export function insertSnippetEntries(text: string, entries: readonly [string, SnippetEntry][]): string {
	if (!text.trim()) return insertSnippetEntries('{\n\t"v": 1,\n\t"snippets": {\n\t}\n}\n', entries);
	const { at, indent } = insertionPoint(text);
	const lines = entries.map(([name, entry]) => `\n${indent}${JSON.stringify(name)}: ${JSON.stringify(entry)},`);
	return text.slice(0, at) + lines.join('') + text.slice(at);
}
