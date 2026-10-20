import { commonFacts } from '../../knowledge/commands/commandFacts';

// the commands the importer reads as the character they print
const NAMES = [
	'%',
	'&',
	'$',
	'#',
	'_',
	'{',
	'}',
	'textbackslash',
	'textasciitilde',
	'textasciicircum',
	'textless',
	'textgreater',
	'textbar',
	'ldots',
	'dots',
	'textendash',
	'textemdash'
];

export const PLAIN_TEXT_COMMANDS: Record<string, string> = Object.fromEntries(
	NAMES.flatMap((name) => {
		const { prints } = commonFacts(name);
		return prints ? [[name, prints]] : [];
	})
);

// control words, whose following space TeX reads as the end of the name
export const CHARACTER_WORDS = new Set(Object.keys(PLAIN_TEXT_COMMANDS).filter((name) => /^[a-zA-Z]+$/.test(name)));
