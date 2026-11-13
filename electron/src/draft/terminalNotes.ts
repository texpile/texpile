// What a line of TeX's terminal output tells a writer who is waiting: the files it opens, the pages it ships and
// what it warns of. The rest of the line is TeX talking to itself.

const READ = /\.(sty|cls|tex|def|cfg|clo|fd|ltx|ldf|bbx|cbx|lbx|bbl|aux|toc|lof|lot|bib)$/i;

/** `own` says whether a path is one of the document's or TeX's, and so worth naming */
export function terminalNotes(line: string, own: (path: string) => boolean = () => true): string[] {
	if (/^! |^(LaTeX|Package|Class)\b.*\b(Warning|Error)\b/.test(line)) return [line.trim().slice(0, 160)];
	const notes: string[] = [];
	for (const [, file, page] of line.matchAll(/\(([^()\s]+)|\[(\d+)/g)) {
		if (page) notes.push(`[${page}]`);
		else if (READ.test(file) && own(file)) notes.push(file.replace(/\\/g, '/').split('/').pop()!);
	}
	return notes;
}
