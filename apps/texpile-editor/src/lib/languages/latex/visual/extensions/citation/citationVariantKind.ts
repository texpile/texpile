import { commonCommand } from '$lib/languages/latex/knowledge/calls/commandCalls';

export type CitationVariantKind = 'parenthetical' | 'intext' | 'automatic' | 'basic';

export function citationVariantKind(command: string): CitationVariantKind {
	switch (commonCommand(command)?.cite) {
		case 'paren':
		case 'paren-bare':
			return 'parenthetical';
		case 'text':
		case 'text-bare':
			return 'intext';
		case 'auto':
			return 'automatic';
		default:
			return 'basic';
	}
}
