import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import {
	ACCENT_COMMANDS,
	ACCENTS,
	SYMBOLS,
	accentBase,
	accented,
	printedCharacter
} from '$lib/languages/latex/knowledge/commands/texCharacters';
import { characterPart, hasArgs, mandatoryArgs, type LatexPlugin } from '$lib/languages/latex/visual/core';
import { readCharacter } from './characterCommand';
import CharacterSettings from './CharacterSettings.svelte';
import { characterDocument } from './document';

function escaped(name: string): string | null {
	const prints = commonFacts(name).prints;
	return prints && !/^[a-zA-Z@]/.test(name) ? prints : null;
}

export const character: LatexPlugin = {
	commands: [...ACCENT_COMMANDS, ...Object.keys(SYMBOLS)],
	role: { commands: (name) => printedCharacter(name) !== null || escaped(name) !== null },
	face(part, core) {
		if (part.kind !== 'command') return undefined;
		const { call, name } = part;
		if (Object.hasOwn(ACCENTS, name)) {
			// a paper's own \d or \v (a differential, a vector) is no accent
			if (core.definedByPaper(name)) return null;
			const base = accentBase(core.text(mandatoryArgs(call)[0]));
			return base ? characterPart(accented(name, base)) : null;
		}
		const printed = Object.hasOwn(SYMBOLS, name) ? SYMBOLS[name] : printedCharacter(name);
		if (printed !== null && !call.args.some((arg) => arg.present && arg.open !== '[')) return characterPart(printed);
		const prints = escaped(name);
		return prints && !hasArgs(call) ? characterPart(prints) : undefined;
	},
	settings: (source) => (readCharacter(source) ? CharacterSettings : null),
	document: characterDocument
};
