// Writes as an agent makes them: a few hunks at once, anywhere in the file, in prose, math, lists, floats, tables,
// headings, citations and the preamble. A hunk splices whole lines, so a write applies its hunks from the bottom up.
const WORDS = ['graph', 'theorem', 'model', 'value', 'equation', 'paper', 'system', 'field'];
// environments whose lines are not prose: math, tables, code, drawings
const NOT_PROSE =
	/tabular|array|align|equation|gather|multline|eqnarray|math|verbatim|lstlisting|minted|tikzpicture|picture|comment|alltt|split|cases|matrix|algorithmic/;
const DISPLAY = /^(equation|align|gather|multline|eqnarray|flalign)\*?$/;
const LISTS = /^(itemize|enumerate|description)$/;
const TABLES = /^(tabular\*?|tabularx|longtable)$/;

function stripComment(line) {
	let out = '';
	for (let k = 0; k < line.length; k++) {
		if (line[k] === '\\') {
			out += line.slice(k, k + 2);
			k++;
		} else if (line[k] === '%') break;
		else out += line[k];
	}
	return out;
}

/** the body's lines and the environments open at the start of each */
export function scan(text, isMain) {
	const lines = text.split('\n');
	let begin = 0;
	let end = lines.length;
	if (isMain) {
		begin = lines.findIndex((l) => /\\begin\s*\{document\}/.test(stripComment(l))) + 1;
		const e = lines.findIndex((l, i) => i >= begin && /\\end\s*\{document\}/.test(stripComment(l)));
		if (e >= 0) end = e;
	}
	const stack = [];
	const envAt = [];
	for (let i = 0; i < lines.length; i++) {
		envAt[i] = stack.slice();
		if (i < begin || i >= end) continue;
		for (const m of stripComment(lines[i]).matchAll(/\\(begin|end)\s*\{([^}]*)\}/g)) {
			if (m[1] === 'begin') stack.push(m[2]);
			else {
				const k = stack.lastIndexOf(m[2]);
				if (k >= 0) stack.length = k;
			}
		}
	}
	return { lines, begin, end, envAt, isMain };
}

const proseEnv = (s, i) => !s.envAt[i].some((e) => NOT_PROSE.test(e));
function where(s, test) {
	const out = [];
	for (let i = s.begin; i < s.end; i++) if (test(s.lines[i], i)) out.push(i);
	return out;
}
// a brace on a line of words closes or opens a group: a word swap or a deleted line would leave it unbalanced
const prose = (s) => where(s, (l, i) => l.trim().length > 20 && !/[\\%$&{}]/.test(l) && proseEnv(s, i));
// a blank line outside every environment: a block can go in after it
const gaps = (s) => where(s, (l, i) => i > s.begin && l.trim() === '' && !s.envAt[i].length && !s.envAt[i + 1]?.length);
const words = (rand, n) => Array.from({ length: n }, () => WORDS[rand(WORDS.length)]).join(' ');

function appendTo(s, rand, tail, what) {
	const at = prose(s);
	if (!at.length) return null;
	const i = at[rand(at.length)];
	return { at: i, del: 1, ins: [s.lines[i] + tail], what };
}
function block(s, rand, ins, what) {
	const at = gaps(s);
	if (!at.length) return null;
	return { at: at[rand(at.length)] + 1, del: 0, ins: [...ins, ''], what };
}
function changeLine(s, rand, at, change, what) {
	if (!at.length) return null;
	const i = at[rand(at.length)];
	return { at: i, del: 1, ins: [change(s.lines[i])], what };
}

const HUNKS = {
	word(s, rand) {
		return changeLine(
			s,
			rand,
			prose(s),
			(l) => {
				const w = l.split(' ');
				w[rand(w.length)] = WORDS[rand(WORDS.length)];
				return w.join(' ');
			},
			'word'
		);
	},
	sentence: (s, rand) => appendTo(s, rand, ` The ${words(rand, 1)} is ${words(rand, 1)} indeed.`, 'sentence'),
	deleteLine(s, rand) {
		const at = prose(s);
		return at.length ? { at: at[rand(at.length)], del: 1, ins: [], what: 'delete' } : null;
	},
	paragraph: (s, rand) => block(s, rand, [words(rand, 40) + '.'], 'paragraph'),
	inlineMath(s, rand) {
		const at = where(s, (l, i) => proseEnv(s, i) && !l.includes('%') && /(^|[^\\$])\$[^$]+[^\\$]\$/.test(l));
		return changeLine(s, rand, at, (l) => l.replace(/((?:^|[^\\$])\$[^$]+?[^\\$])\$/, '$1 + \\alpha$'), 'inline math');
	},
	newInlineMath: (s, rand, n) => appendTo(s, rand, ` With $x_{${n}} = \\frac{1}{2}$ the bound holds.`, 'new inline math'),
	displayMath: (s, rand, n) =>
		block(s, rand, ['\\begin{equation}', `  E_{${n}} = \\sum_{k=1}^{n} k^{2} + \\alpha_{${n}}`, '\\end{equation}'], 'display math'),
	mathInParagraph(s, rand) {
		const at = prose(s);
		if (!at.length) return null;
		const i = at[rand(at.length)];
		return { at: i + 1, del: 0, ins: ['\\[', '  a^{2} + b^{2} = c^{2}', '\\]'], what: 'math in a paragraph' };
	},
	editEquation(s, rand) {
		const at = where(
			s,
			(l, i) => DISPLAY.test(s.envAt[i].at(-1) ?? '') && l.trim() !== '' && !/^\s*(\\(begin|end|label|nonumber|notag)|%|&)/.test(l)
		);
		return changeLine(s, rand, at, (l) => l.replace(/^(\s*)/, '$1\\beta + '), 'equation');
	},
	itemize: (s, rand) =>
		block(
			s,
			rand,
			['\\begin{itemize}', '  \\item The first agent point.', '  \\item The second agent point.', '\\end{itemize}'],
			'itemize'
		),
	addItem(s, rand) {
		const at = where(s, (l, i) => /^\s*\\item\b/.test(l) && LISTS.test(s.envAt[i].at(-1) ?? ''));
		return at.length ? { at: at[rand(at.length)], del: 0, ins: [`  \\item An added ${words(rand, 3)} item.`], what: 'add item' } : null;
	},
	dropItem(s, rand) {
		const at = where(
			s,
			(l, i) =>
				/^\s*\\item\b/.test(l) &&
				LISTS.test(s.envAt[i].at(-1) ?? '') &&
				/^\s*(\\item\b|\\end\b|$)/.test(s.lines[i + 1] ?? '') &&
				s.lines.slice(s.begin, i).some((p, k) => /^\s*\\item\b/.test(p) && s.envAt[s.begin + k].length === s.envAt[i].length)
		);
		return at.length ? { at: at[rand(at.length)], del: 1, ins: [], what: 'drop item' } : null;
	},
	figure: (s, rand, n) =>
		block(
			s,
			rand,
			[
				'\\begin{figure}[ht]',
				'  \\centering',
				`  \\fbox{Agent figure ${n}}`,
				`  \\caption{An agent figure, number ${n}.}`,
				`  \\label{fig:agent${n}}`,
				'\\end{figure}'
			],
			'figure'
		),
	table: (s, rand, n) =>
		block(
			s,
			rand,
			[
				'\\begin{table}[ht]',
				'  \\centering',
				`  \\caption{An agent table, number ${n}.}`,
				'  \\begin{tabular}{lc}',
				'    \\hline',
				'    alpha & 1 \\\\',
				'    beta & 2 \\\\',
				'    \\hline',
				'  \\end{tabular}',
				'\\end{table}'
			],
			'table'
		),
	caption: (s, rand) =>
		changeLine(
			s,
			rand,
			where(s, (l) => /\\caption\{/.test(l) && !l.trim().startsWith('%')),
			(l) => l.replace('\\caption{', '\\caption{Agent '),
			'caption'
		),
	cell(s, rand) {
		const at = where(s, (l, i) => s.envAt[i].some((e) => TABLES.test(e)) && l.includes('&') && /\\\\/.test(l) && !/^\s*[\\%>@}]/.test(l));
		return changeLine(s, rand, at, (l) => l.replace(/^(\s*)/, '$1x '), 'table cell');
	},
	sectionTitle: (s, rand) =>
		changeLine(
			s,
			rand,
			where(s, (l) => /^\s*\\(sub)*section\*?\{/.test(l)),
			(l) => l.replace(/(\\(?:sub)*section\*?\{)/, '$1Agent '),
			'section title'
		),
	newSection: (s, rand, n) => block(s, rand, [`\\section{Agent section ${n}}`, '', words(rand, 30) + '.'], 'new section'),
	cite: (s, rand, n, refs) =>
		refs.cites.length ? appendTo(s, rand, ` As shown in~\\cite{${refs.cites[rand(refs.cites.length)]}}, it holds.`, 'cite') : null,
	dropCite(s, rand) {
		const re = /~?\\cite[a-zA-Z]*\*?(\[[^\]]*\])*\{[^}]*\}/;
		return changeLine(
			s,
			rand,
			where(s, (l) => re.test(l) && !l.trim().startsWith('%')),
			(l) => l.replace(re, ''),
			'drop cite'
		);
	},
	ref: (s, rand, n, refs) =>
		refs.labels.length ? appendTo(s, rand, ` See~\\ref{${refs.labels[rand(refs.labels.length)]}} for more.`, 'ref') : null
};
const NAMES = Object.keys(HUNKS);

/** the citation keys and labels a document already has, so new \cite and \ref resolve */
export function refsOf(texts) {
	const cites = new Set();
	const labels = new Set();
	for (const t of texts) {
		for (const m of t.matchAll(/\\cite[a-zA-Z]*\*?(?:\[[^\]]*\])*\{([^}]+)\}/g))
			for (const k of m[1].split(',')) if (k.trim()) cites.add(k.trim());
		for (const m of t.matchAll(/\\label\{([^}#\\]+)\}/g)) labels.add(m[1]);
	}
	return { cites: [...cites], labels: [...labels] };
}

export function applyHunks(lines, hunks) {
	const out = lines.slice();
	for (const h of [...hunks].sort((a, b) => b.at - a.at)) out.splice(h.at, h.del, ...h.ins);
	return out.join('\n');
}

/** one write of 2 to 5 hunks, none touching another; the preamble gets a definition the body then uses */
export function agentWrite(text, isMain, rand, n, refs, preamble = false) {
	const s = scan(text, isMain);
	const hunks = [];
	const taken = new Set();
	if (preamble && isMain && s.begin > 0) {
		const macro = `\\agentmacro${String.fromCharCode(97 + (n % 26))}`;
		const def = [`\\newcommand{${macro}}{agent words}`, `% agent note ${n}`, `\\providecommand{\\agentnote}{}`][rand(3)];
		hunks.push({ at: s.begin - 1, del: 0, ins: [def], what: 'preamble' });
		taken.add(s.begin - 1);
		if (def.startsWith('\\newcommand')) {
			const use = appendTo(s, rand, ` The ${macro}{} hold here.`, 'macro use');
			if (use) hunks.push(use);
			if (use) taken.add(use.at);
		}
	}
	const want = 2 + rand(4);
	for (let tries = 0; hunks.length < want && tries < 40; tries++) {
		const h = HUNKS[NAMES[rand(NAMES.length)]](s, rand, n * 10 + hunks.length, refs);
		if (!h) continue;
		const span = [h.at - 1, h.at, h.at + Math.max(h.del, 1)];
		if (span.some((i) => taken.has(i))) continue;
		for (let i = h.at; i <= h.at + h.del; i++) taken.add(i);
		hunks.push(h);
	}
	if (!hunks.length) return null;
	return { text: applyHunks(s.lines, hunks), hunks, what: hunks.map((h) => `${h.what}@${h.at + 1}`).join(' ') };
}

/** what a write looks like half done: the file cut off past its first change, a brace left open, or half a new line */
export function brokenText(text, before, rand) {
	let first = 0;
	while (first < text.length && text[first] === before[first]) first++;
	const kind = rand(3);
	if (kind === 0) return { text: text.slice(0, first + rand(Math.max(1, text.length - first))), how: 'cut off' };
	const lines = text.split('\n');
	const at = lines.findIndex((l, i) => i >= text.slice(0, first).split('\n').length - 1 && l.trim().length > 10);
	if (at < 0) return { text: text.slice(0, first), how: 'cut off' };
	if (kind === 1) lines[at] += ' \\textbf{agent';
	else lines[at] = lines[at].slice(0, Math.ceil(lines[at].length / 2));
	return { text: lines.join('\n'), how: kind === 1 ? 'open brace' : 'half a line' };
}
