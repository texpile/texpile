// what TeX reads of a file: comments, verbatim text and \iffalse blocks blanked out
import { commonEnvFacts, hasUnreadBody, type EnvFacts } from '$lib/languages/latex/knowledge/environments/envFacts';
import { argumentsEnd, callsIn, rolesOf } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { verbatimCallEnd, verbatimCommandNames } from '$lib/languages/latex/knowledge/calls/verbatimCalls';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';

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
			} else if (commonFacts(tokens[k].name).conditional && !named(k)) depth++;
		}
		const end = close >= 0 ? close : firstFi;
		if (end < 0) continue;
		blocks.push([tokens[i].from, tokens[end].to]);
		i = end;
	}
	return blocks;
}

const BEGIN_AT = /\\begin\{([^{}\n]+)\}/y;
const NAME_AT = /\\([A-Za-z]+)/y;
const verbatimNames = new Set(verbatimCommandNames());

/** 'verbatim' leaves comments and skipped bodies readable; `openings` keeps the \begin and options of a blanked environment */
export type UnreadMask = { masked: 'all' | 'verbatim'; openings: boolean };

/** comments, verbatim command text and verbatim or skipped bodies blanked, in one pass so a commented \begin opens nothing and a
 * % in a URL stays a character */
export function blankUnread(tex: string, { masked, openings }: UnreadMask = { masked: 'all', openings: false }): string {
	const urls = callsIn(tex, ['url'])
		.flatMap((c) => c.args.filter((a) => rolesOf(a.arg).includes('url')).map((a) => [a.from, a.to]))
		.filter(([from, to]) => !tex.slice(from, to).includes('\n'));
	function unread(facts: EnvFacts): boolean {
		return masked === 'all' ? hasUnreadBody(facts) : facts.body === 'verbatim';
	}
	let next = 0;
	let out = '';
	let at = 0;
	function blankTo(from: number, to: number) {
		out += tex.slice(at, from) + blank(tex.slice(from, to));
		at = to;
	}
	for (let i = 0; i < tex.length; i++) {
		while (next < urls.length && urls[next][1] <= i) next++;
		if (next < urls.length && urls[next][0] <= i) {
			i = urls[next][1] - 1;
			continue;
		}
		const c = tex[i];
		if (c === '%') {
			const eol = tex.indexOf('\n', i);
			const end = eol < 0 ? tex.length : eol;
			if (masked === 'all') blankTo(i, end);
			i = end;
		} else if (c === '\\') {
			NAME_AT.lastIndex = i;
			const name = NAME_AT.exec(tex)?.[1];
			if (name && verbatimNames.has(name)) {
				const end = verbatimCallEnd(tex, i + 1 + name.length, name);
				if (end >= 0) {
					blankTo(i, end);
					i = end - 1;
					continue;
				}
			}
			BEGIN_AT.lastIndex = i;
			const open = BEGIN_AT.exec(tex);
			const facts = open ? commonEnvFacts(open[1]) : null;
			if (open && facts && unread(facts)) {
				const closer = `\\end{${open[1]}}`;
				const close = tex.indexOf(closer, i + open[0].length);
				if (close >= 0) {
					const bodyAt = i + open[0].length;
					blankTo(openings ? Math.min(argumentsEnd(tex, bodyAt, facts.args ?? []), close) : i, close + closer.length);
					i = close + closer.length - 1;
					continue;
				}
			}
			i++;
		}
	}
	return out + tex.slice(at);
}

let lastRead: { tex: string; code: string } | null = null;

/** blanked with spaces, so offsets hold; the checks that run on one text share the work */
export function codeOnly(tex: string): string {
	if (lastRead?.tex === tex) return lastRead.code;
	const code = blankFalse(blankUnread(tex));
	lastRead = { tex, code };
	return code;
}

/** the same, with the \begin line and options of a verbatim environment left readable (\begin{lstlisting}[label=a]) */
export function codeKeepingOpenings(tex: string): string {
	return blankFalse(blankUnread(tex, { masked: 'all', openings: true }));
}

function blankFalse(read: string): string {
	if (!read.includes('\\iffalse')) return read;
	let out = '';
	let at = 0;
	for (const [from, to] of falseBlocks(read)) {
		out += read.slice(at, from) + blank(read.slice(from, to));
		at = to;
	}
	return out + read.slice(at);
}
