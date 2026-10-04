// display-math assembly: equation/align environments and their label plumbing

const DISPLAY_ENVIRONMENTS = [
	'align',
	'align*',
	'alignat',
	'alignat*',
	'equation',
	'equation*',
	'gather',
	'gather*',
	'multline',
	'multline*',
	'flalign',
	'flalign*',
	'eqnarray',
	'eqnarray*'
];

export function hasDisplayEnvironment(content: string): boolean {
	const t = content.trim();
	return DISPLAY_ENVIRONMENTS.some((env) => t.startsWith(`\\begin{${env}}`));
}

export function blockMath(content: string, opts: { numbered: boolean; label?: string; starredEnv?: boolean }): string {
	const processed = content.trim();
	if (hasDisplayEnvironment(processed)) return processed + '\n';
	if (opts.numbered && opts.label) return `\\begin{equation}\\label{${opts.label}}\n${processed}\n\\end{equation}\n`;
	if (opts.numbered) return `\\begin{equation}\n${processed}\n\\end{equation}\n`;
	if (opts.starredEnv) return `\\begin{equation*}\n${processed}\n\\end{equation*}\n`;
	return `\\[\n${processed}\n\\]\n`;
}

function extractEnvironmentContent(latex: string, envName: string): string | null {
	const pattern = new RegExp(`\\\\begin\\{${envName}\\*?\\}([\\s\\S]*)\\\\end\\{${envName}\\*?\\}`, 'i');
	const m = latex.match(pattern);
	return m ? m[1].trim() : null;
}

/** rows at the even indices, `\\` breaks at the odd; one inside braces or a nested cases or matrix is not the display's */
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
				const rowBreak = /^\\\\(?:\s*\[[^\]]*\])?/.exec(body.slice(i))![0];
				parts.push(body.slice(start, i), rowBreak);
				start = i + rowBreak.length;
				i = start - 1;
				continue;
			}
			i++;
		} else if (ch === '{') depth++;
		else if (ch === '}') depth--;
	}
	parts.push(body.slice(start));
	return parts;
}

export function alignEnvironment(
	content: string,
	opts: { environment: string; lineLabels: string[]; label?: string; numbered: boolean }
): string {
	const envName = opts.numbered ? opts.environment : `${opts.environment}*`;
	let inner = extractEnvironmentContent(content, opts.environment);
	if (inner === null) inner = content.trim();
	// rows at the even indices, the row breaks between them at the odd ones: a break's spacing
	// argument (`\\[2mm]`) is the row's, and goes back where it was
	const parts = splitRows(inner);
	const lines = parts.filter((_, i) => i % 2 === 0);
	const breaks = parts.filter((_, i) => i % 2 === 1).map((b) => b.replace(/^\\\\\s*/, '\\\\'));
	// a trailing \\ on the last row leaves one final EMPTY split segment. left in, the re-join
	// adds a stray separator and the template's own \n compounds into a blank line inside math
	// mode, which is illegal ("Paragraph ended before \align* was complete"). drop it; the join
	// places separators only between real rows, the canonical trailing-\\-free form.
	if (lines.length > 1 && lines[lines.length - 1].trim() === '') {
		lines.pop();
		breaks.pop();
	}
	const processed = lines.map((line, i) => {
		const t = line.trim();
		const lbl = opts.lineLabels[i] || '';
		return lbl && opts.numbered ? `${t} \\label{${lbl}}` : t;
	});
	let joined = processed.map((t, i) => (i < processed.length - 1 ? `${t} ${breaks[i] ?? '\\\\'}\n` : t)).join('');
	if (opts.label && opts.numbered && opts.environment === 'multline') {
		joined = joined.replace(/\n$/, '') + ` \\label{${opts.label}}`;
	}
	return `\\begin{${envName}}\n${joined}\n\\end{${envName}}\n`;
}
