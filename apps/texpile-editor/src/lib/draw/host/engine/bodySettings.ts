// the settings a picture's own lines read before it, written in the document's body: TeX reads them in order, so the
// engine reads them after the preamble
import type { SyntaxNode } from '@lezer/common';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { environmentName } from '$lib/languages/latex/syntax/treeMode';

const SETTINGS = new Set([
	'usetikzlibrary',
	'tikzset',
	'tikzstyle',
	'pgfplotsset',
	'pgfkeys',
	'definecolor',
	'colorlet',
	'newcommand',
	'renewcommand',
	'providecommand',
	'def'
]);
const INPUTS = new Set(['input', 'include', 'subfile']);

/** where a setting's arguments end: its groups, its bracketed options, an `=` between them, and \def's name */
function settingEnd(text: string, command: SyntaxNode): number {
	let end = command.to;
	let depth = 0;
	for (let s = command.nextSibling; s; s = s.nextSibling) {
		const slice = text.slice(s.from, s.to);
		if (s.name === 'OpenBracket') depth++;
		else if (s.name === 'CloseBracket') depth--;
		else if (
			depth === 0 &&
			s.name !== 'Group' &&
			!(s.name === 'Text' && /^[ \t=]*$/.test(slice)) &&
			!(s.name === 'ControlWord' && end === command.to)
		)
			break;
		end = s.to;
		if (depth < 0) break;
	}
	return end;
}

/** the setting commands of the body from `from` to `to`, outside groups and environments other than the document */
export function settingsIn(text: string, from: number, to: number): string[] {
	const found: string[] = [];
	latexTreeOf(text).iterate({
		from,
		to,
		enter: (n) => {
			if (n.from >= to) return false;
			if (n.name === 'Group') return false;
			if (n.name === 'Environment' && n.node.firstChild && environmentName(text, n.node.firstChild) !== 'document') return false;
			if (n.name !== 'ControlWord' || n.from < from || !SETTINGS.has(text.slice(n.from + 1, n.to))) return;
			found.push(text.slice(n.from, settingEnd(text, n.node)));
		}
	});
	return found;
}

/** where the main file reads the fragment, by `\input` and its kin; the end of the text when it does not */
export function inputOf(text: string, fragment: string): number {
	const name = fragment.replace(/\.(tex|tikz)$/i, '');
	let at = text.length;
	latexTreeOf(text).iterate({
		enter: (n) => {
			if (at < text.length) return false;
			if (n.name !== 'ControlWord' || !INPUTS.has(text.slice(n.from + 1, n.to))) return;
			const arg = n.node.nextSibling;
			const read = arg?.name === 'Group' ? text.slice(arg.from + 1, arg.to - 1).trim() : '';
			if (read.replace(/\.(tex|tikz)$/i, '') === name) at = n.from;
		}
	});
	return at;
}
