export function splitRows(body: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < body.length; i++) {
		const ch = body[i];
		if (ch === '\\') {
			if (body.startsWith('\\begin{', i)) depth++;
			else if (body.startsWith('\\end{', i)) depth--;
			else if (body[i + 1] === '\\' && depth === 0) {
				// amsmath's \\ takes only a [ written right after it: a row that opens with a bracket is the row's
				const rowBreak = /^\\\\(?:\[[^\]]*\])?/.exec(body.slice(i))![0];
				parts.push(body.slice(start, i), rowBreak);
				start = i + rowBreak.length;
				i = start - 1;
				continue;
			}
			i++;
		} else if (ch === '{') depth++;
		else if (ch === '}') depth--;
		else if (ch === '%') {
			const end = body.indexOf('\n', i);
			i = end < 0 ? body.length : end;
		}
	}
	parts.push(body.slice(start));
	return parts;
}
