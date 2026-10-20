// a font group ({\bf ...}) or a style command (\textsc{...}) as its words, which change in place; a bold or italic
// group can become the editor's own bold or italic, written as the command that marks it
import { STYLED, SWITCHES } from '$lib/languages/latex/drawnCommands';
import { commandsWith } from '$lib/languages/latex/knowledge/commands/commandFacts';
import { balancedBraces } from './balancedBraces';

export type TextStyleKind =
	| 'bold'
	| 'italic'
	| 'emphasis'
	| 'slanted'
	| 'typewriter'
	| 'smallCaps'
	| 'sansSerif'
	| 'plain'
	| 'size'
	| 'underline'
	| 'together'
	| 'framed'
	| 'superscript'
	| 'subscript';

export type TextStyle = { name: string; group: boolean; kind: TextStyleKind; words: string };

const KINDS: Record<string, TextStyleKind> = {
	...Object.fromEntries(['bf', 'bfseries', 'textbf'].map((name) => [name, 'bold'])),
	...Object.fromEntries(['it', 'itshape', 'textit'].map((name) => [name, 'italic'])),
	...Object.fromEntries(['em', 'emph'].map((name) => [name, 'emphasis'])),
	...Object.fromEntries(['sl', 'slshape', 'textsl'].map((name) => [name, 'slanted'])),
	...Object.fromEntries(['tt', 'ttfamily', 'texttt'].map((name) => [name, 'typewriter'])),
	...Object.fromEntries(['sc', 'scshape', 'textsc'].map((name) => [name, 'smallCaps'])),
	...Object.fromEntries(['sf', 'sffamily', 'textsf'].map((name) => [name, 'sansSerif'])),
	...Object.fromEntries(commandsWith('declares', 'size').map((name) => [name, 'size'])),
	...Object.fromEntries(['underline', 'uline'].map((name) => [name, 'underline'])),
	mbox: 'together',
	fbox: 'framed',
	textsuperscript: 'superscript',
	textsubscript: 'subscript'
};

/** the groups the editor's own bold and italic stand for, and the command they are written with */
const ORDINARY: Record<string, string> = { bf: 'textbf', bfseries: 'textbf', it: 'textit', itshape: 'textit', em: 'emph' };

const GROUP = /^(\s*\{\s*\\([a-zA-Z]+)(?![a-zA-Z])\s*)([\s\S]*)(\}\s*)$/;
const COMMAND = /^(\s*\\([a-zA-Z]+)\s*\{)([\s\S]*)(\}\s*)$/;

export function readTextStyle(source: string): TextStyle | null {
	const group = GROUP.exec(source);
	if (group && group[2] in SWITCHES && balancedBraces(group[3]))
		return { name: group[2], group: true, kind: KINDS[group[2]] ?? 'plain', words: group[3] };
	const command = COMMAND.exec(source);
	if (command && command[2] in STYLED && balancedBraces(command[3]))
		return { name: command[2], group: false, kind: KINDS[command[2]] ?? 'plain', words: command[3] };
	return null;
}

export function writeTextStyle(source: string, style: TextStyle, words: string): string {
	return source.replace(
		style.group ? GROUP : COMMAND,
		(_, open: string, _name: string, _words: string, close: string) => open + words + close
	);
}

/** the command a group becomes as the editor's own bold or italic, or null when it has no such twin */
export function ordinaryCommand(style: TextStyle): string | null {
	return style.group ? (ORDINARY[style.name] ?? null) : null;
}

export function writeOrdinary(source: string, style: TextStyle, command: string): string {
	return source.replace(GROUP, (_, open: string, _name: string, words: string, close: string) => {
		const lead = /^\s*/.exec(open)![0];
		return `${lead}\\${command}{${words}}${close.slice(1)}`;
	});
}
