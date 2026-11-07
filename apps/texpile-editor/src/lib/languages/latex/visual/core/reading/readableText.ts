// the words a piece of LaTeX prints, as plain text for a hint: accents as letters, commands give their arguments
import { decodeTexCharacters } from '$lib/languages/latex/knowledge/commands/texCharacters';

export function readableText(source: string): string {
	return decodeTexCharacters(source.replace(/(^|[^\\])%.*$/gm, '$1'))
		.replace(/\\[a-zA-Z@]+\*?(?=[{[])/g, '')
		.replace(/\\[a-zA-Z@]+\*?/g, ' ')
		.replace(/\\[,;:!> ]/g, ' ')
		.replace(/[{}$]/g, '')
		.replace(/~/g, ' ')
		.replace(/[^\S\n]+/g, ' ')
		.replace(/ *\n */g, '\n')
		.replace(/ ([,.;:)\]])/g, '$1')
		.normalize('NFC')
		.trim();
}
