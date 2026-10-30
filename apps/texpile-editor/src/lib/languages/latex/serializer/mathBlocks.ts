// display-math assembly: equation/align environments and their label plumbing

import { commonEnvFacts } from '$lib/languages/latex/knowledge/environments/envFacts';

// the data lists equation* under equation only
function isDisplayMathEnvironment(name: string): boolean {
	const body = commonEnvFacts(name).body ?? commonEnvFacts(name.replace(/\*$/, '')).body;
	return body === 'math-display';
}

export function hasDisplayEnvironment(content: string): boolean {
	const name = /^\\begin\{([^{}]*)\}/.exec(content.trim())?.[1];
	return name !== undefined && isDisplayMathEnvironment(name);
}

// a blank line in display math is a paragraph break, which TeX stops on; a label taken off its own line leaves one
function withoutBlankLines(math: string): string {
	return math.replace(/\n[ \t]*(?:\n[ \t]*)+/g, '\n');
}

export function blockMath(content: string, opts: { numbered: boolean; label?: string; starredEnv?: boolean }): string {
	const processed = withoutBlankLines(content.trim());
	if (hasDisplayEnvironment(processed)) return processed + '\n';
	// an empty display gets no blank line, which TeX reads as a paragraph break inside the math
	const lines = processed ? `${processed}\n` : '';
	if (opts.numbered && opts.label) return `\\begin{equation}\\label{${opts.label}}\n${lines}\\end{equation}\n`;
	if (opts.numbered) return `\\begin{equation}\n${lines}\\end{equation}\n`;
	if (opts.starredEnv) return `\\begin{equation*}\n${lines}\\end{equation*}\n`;
	return `\\[\n${lines}\\]\n`;
}

function extractEnvironmentContent(latex: string, envName: string): string | null {
	const pattern = new RegExp(`\\\\begin\\{${envName}\\*?\\}([\\s\\S]*)\\\\end\\{${envName}\\*?\\}`, 'i');
	const m = latex.match(pattern);
	return m ? m[1].trim() : null;
}

/** rows at the even indices, `\\` breaks at the odd; one inside braces, a comment or a nested cases or matrix is not the display's */
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

const COMMENTED_LINE_END = /(?:^|[^\\])(?:\\\\)*%[^\n]*$/;

// a row that ends in a comment would comment out what follows it on the line
function appended(row: string, tail: string): string {
	return COMMENTED_LINE_END.test(row) ? `${row}\n${tail}` : `${row} ${tail}`;
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
		const t = withoutBlankLines(line.trim());
		const lbl = opts.lineLabels[i] || '';
		return lbl && opts.numbered ? appended(t, `\\label{${lbl}}`) : t;
	});
	let joined = processed.map((t, i) => (i < processed.length - 1 ? `${appended(t, breaks[i] ?? '\\\\')}\n` : t)).join('');
	if (opts.label && opts.numbered && commonEnvFacts(opts.environment).numbering === 'single') {
		joined = appended(joined.replace(/\n$/, ''), `\\label{${opts.label}}`);
	}
	return `\\begin{${envName}}\n${joined}\n\\end{${envName}}\n`;
}
