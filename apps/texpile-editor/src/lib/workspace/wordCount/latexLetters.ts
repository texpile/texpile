import { ACCENT_COMMANDS, LETTER_SYMBOLS } from '$lib/languages/latex/knowledge/commands/texCharacters';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';

const LETTER_COMMANDS = new Set(LETTER_SYMBOLS);

// the letter an accent marks: bare after a symbol accent (\'e), braced after either (\"{\i}, \v{c})
const SYMBOL_ACCENT_LETTER = /^\s*(?:\{\s*(\\?[A-Za-z])\s*\}|([A-Za-z]))/;
const WORD_ACCENT_LETTER = /^\{\s*(\\?[A-Za-z])\s*\}/;
// a control word takes the spaces after it, or the {} that ends it
const AFTER_LETTER_COMMAND = /^(?:\{\}|[ \t]*)/;

type Edit = { from: number; to: number; text: string };

// the arguments are short, so only a stretch after the command is looked at
const LOOKAHEAD = 200;

function matchAt(re: RegExp, src: string, at: number): RegExpExecArray | null {
	return re.exec(src.slice(at, at + LOOKAHEAD));
}

/** accents written as commands (caf\'e, na\"{\i}ve, \v{c}) and letters written as commands (Stra\ss e) would split a word: the letter stands for them */
export function spellOutLetters(source: string): string {
	if (!source.includes('\\')) return source;
	const edits: Edit[] = [];
	let last = 0;
	function edit(from: number, to: number, text: string) {
		edits.push({ from, to, text });
		last = to;
	}
	latexTreeOf(source).iterate({
		enter(node) {
			if (node.from < last || (node.name !== 'ControlSymbol' && node.name !== 'ControlWord')) return;
			const name = source.slice(node.from + 1, node.to);
			if (ACCENT_COMMANDS.has(name)) {
				const found = matchAt(node.name === 'ControlSymbol' ? SYMBOL_ACCENT_LETTER : WORD_ACCENT_LETTER, source, node.to);
				if (found) edit(node.from, node.to + found[0].length, (found[1] ?? found[2]).replace('\\', ''));
			} else if (node.name === 'ControlWord' && LETTER_COMMANDS.has(name)) {
				edit(node.from, node.to + matchAt(AFTER_LETTER_COMMAND, source, node.to)![0].length, 'x');
			}
		}
	});
	let out = '';
	let at = 0;
	for (const e of edits) {
		out += source.slice(at, e.from) + e.text;
		at = e.to;
	}
	return out + source.slice(at);
}
