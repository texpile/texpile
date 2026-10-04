// what TeX reads of a file: comments, verbatim text and \iffalse blocks blanked out

const OPAQUE_ENVS =
	/\\begin\{(verbatim\*?|Verbatim\*?|BVerbatim|LVerbatim|lstlisting|minted|comment|filecontents\*?)\}[\s\S]*?\\end\{\1\}/g;

// the primitives that each open a conditional with its own \fi; \ifthenelse and \iftoggle are macros
const CONDITIONALS = new Set([
	'if',
	'ifcat',
	'ifnum',
	'ifdim',
	'ifodd',
	'ifvmode',
	'ifhmode',
	'ifmmode',
	'ifinner',
	'ifvoid',
	'ifhbox',
	'ifvbox',
	'ifx',
	'ifeof',
	'iftrue',
	'iffalse',
	'ifcase',
	'ifdefined',
	'ifcsname',
	'iffontchar',
	'ifincsname'
]);

function blank(s: string): string {
	return s.replace(/[^\n]/g, ' ');
}

/** each \iffalse through the \fi that closes it, or through the first \fi after it when none does */
function falseBlocks(tex: string): [number, number][] {
	const tokens = [...tex.matchAll(/\\(?:[A-Za-z]+|[^A-Za-z])/g)].map((m) => ({
		name: m[0].slice(1),
		from: m.index ?? 0,
		to: (m.index ?? 0) + m[0].length
	}));
	function adjacent(a: number, b: number): boolean {
		return /^[\s=]*$/.test(tex.slice(tokens[a].to, tokens[b].from));
	}
	function is(k: number, name: string): boolean {
		return k >= 0 && tokens[k].name === name;
	}
	// a conditional \newif or \let only names (\let\ifdraft\iffalse) opens nothing
	function named(k: number): boolean {
		if ((is(k - 1, 'newif') || is(k - 1, 'let')) && adjacent(k - 1, k)) return true;
		return is(k - 2, 'let') && adjacent(k - 2, k - 1) && adjacent(k - 1, k);
	}
	const blocks: [number, number][] = [];
	for (let i = 0; i < tokens.length; i++) {
		if (tokens[i].name !== 'iffalse' || named(i)) continue;
		let depth = 0;
		let firstFi = -1;
		let close = -1;
		for (let k = i; k < tokens.length && close < 0; k++) {
			if (tokens[k].name === 'fi') {
				if (firstFi < 0) firstFi = k;
				if (--depth === 0) close = k;
			} else if (CONDITIONALS.has(tokens[k].name) && !named(k)) depth++;
		}
		const end = close >= 0 ? close : firstFi;
		if (end < 0) continue;
		blocks.push([tokens[i].from, tokens[end].to]);
		i = end;
	}
	return blocks;
}

/** blanked with spaces, so offsets hold */
export function codeOnly(tex: string): string {
	const read = tex
		.replace(OPAQUE_ENVS, blank)
		.replace(/\\verb\*?([^\sA-Za-z*])[^\n]*?\1/g, blank)
		// a % after an even run of backslashes (\\% is a line break, then a comment)
		.replace(/(^|[^\\])((?:\\\\)*)(%[^\n]*)/g, (_, lead: string, breaks: string, c: string) => lead + breaks + blank(c));
	if (!read.includes('\\iffalse')) return read;
	let out = '';
	let at = 0;
	for (const [from, to] of falseBlocks(read)) {
		out += read.slice(at, from) + blank(read.slice(from, to));
		at = to;
	}
	return out + read.slice(at);
}
