/**
 * Every file a Typst source's `#bibliography(...)` names, as written: its first argument is one path
 * or an array of them (`#bibliography(("refs.bib", "extra.yml"))`). A `#set bibliography(...)` names
 * none, and a commented-out call does not count.
 */
export function typstBibliographyPaths(text: string): string[] {
	const call = /\bbibliography\s*\(/g;
	const str = /\s*"((?:[^"\\\n]|\\.)*)"\s*,?/y;
	let m: RegExpExecArray | null;
	while ((m = call.exec(text))) {
		const lineStart = text.lastIndexOf('\n', m.index) + 1;
		const before = text.slice(lineStart, m.index).replace(/"(?:[^"\\]|\\.)*"/g, '""');
		if (before.includes('//')) continue;
		let i = m.index + m[0].length;
		while (/\s/.test(text[i] ?? '')) i++;
		const list = text[i] === '(';
		if (list) i++;
		const paths: string[] = [];
		for (;;) {
			str.lastIndex = i;
			const s = str.exec(text);
			if (!s) break;
			paths.push(s[1]);
			i = str.lastIndex;
			if (!list) break;
		}
		if (paths.length) return paths;
	}
	return [];
}
