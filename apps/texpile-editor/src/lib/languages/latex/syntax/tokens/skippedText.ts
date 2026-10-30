import type { InputStream } from '@lezer/lr';
import { commonFacts } from '../../knowledge/commands/commandFacts';
import { commonCommand } from '../../knowledge/calls/commandCalls';
import { packageDefining } from '../../knowledge/commands/packageFor';

const BACKSLASH = 92;
const PERCENT = 37;
const NEWLINE = 10;
// an incremental parse reuses nodes from 25 characters past an edit, so a token reads no further back than this
export const LOOK_BACK = 24;

// \let\ifdraft\iffalse and \newif only name the conditional
const NAMED_BEFORE = /\\(?:newif|let)[ \t]*(?:\\(?:[A-Za-z@]+|.)[ \t]*=?[ \t]*)?$/;

function lineBeforeAt(input: InputStream, at: number): string {
	let line = '';
	for (let i = at - 1, c = input.peek(i); c >= 0 && c !== NEWLINE && at - i <= LOOK_BACK; c = input.peek(--i))
		line = String.fromCharCode(c) + line;
	return line;
}

function nameAt(input: InputStream, at: number): string {
	let name = '';
	for (let c = input.peek(at); (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 64; c = input.peek(at + name.length))
		name += String.fromCharCode(c);
	return name;
}

const OPEN_BRACE = 123;

function braceAfter(input: InputStream, at: number): boolean {
	let i = at;
	while (input.peek(i) === 32 || input.peek(i) === 9) i++;
	return input.peek(i) === OPEN_BRACE;
}

// an `if` name the data does not know is a \newif; `called` is a package's command given an argument, which a \newif can share
function conditional(name: string, called: boolean): boolean {
	if (commonFacts(name).conditional) return true;
	return name.startsWith('if') && name.length > 2 && !commonCommand(name) && !(called && packageDefining('command', name));
}

/** `end` of the `\fi` closing the `\iffalse`, 0 when none does; `firstFi` is the first `\fi` after it */
function closingFi(input: InputStream, readCalls: boolean): { end: number; firstFi: number } {
	let depth = 0;
	let firstFi = 0;
	for (let i = 0, c = input.peek(0); c >= 0; c = input.peek(++i)) {
		if (c === PERCENT) {
			while (input.peek(i + 1) >= 0 && input.peek(i + 1) !== NEWLINE) i++;
			continue;
		}
		if (c !== BACKSLASH) continue;
		const name = nameAt(input, i + 1);
		if (!name) {
			i++;
			continue;
		}
		const end = i + 1 + name.length;
		if (name === 'fi') {
			firstFi ||= end;
			if (--depth === 0) return { end, firstFi };
		} else if (conditional(name, readCalls && braceAfter(input, end)) && !NAMED_BEFORE.test(lineBeforeAt(input, i))) depth++;
		i = end - 1;
	}
	return { end: 0, firstFi };
}

/** how long the text TeX skips from an `\iffalse` at the input; 0 when it skips nothing */
export function skippedLength(input: InputStream): number {
	if (nameAt(input, 1) !== 'iffalse' || NAMED_BEFORE.test(lineBeforeAt(input, 0))) return 0;
	const all = closingFi(input, false);
	return all.end || closingFi(input, true).end || all.firstFi;
}
