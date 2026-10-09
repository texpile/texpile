// what a dictionary must not read in Markdown source, blanked so offsets hold: front matter, code, link addresses, URLs
const NOT_PROSE = [
	/^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/,
	/^(```|~~~)[\s\S]*?^\1/gm,
	/`[^`\n]+`/g,
	/\]\([^)\n]*\)/g,
	/<[a-z][\w+.-]*:[^>\s]*>/gi,
	/\b[a-z][\w+.-]*:\/\/[^\s)>\]]*[^\s)>\].,;:!?]/gi
];

export function maskMarkdown(text: string): string {
	return NOT_PROSE.reduce((masked, pattern) => masked.replace(pattern, (found) => found.replace(/[^\n]/g, ' ')), text);
}
