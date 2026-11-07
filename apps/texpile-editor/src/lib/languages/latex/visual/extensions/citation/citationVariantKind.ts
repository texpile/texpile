import { citeFormOf } from '$lib/languages/latex/knowledge/calls/citeCommands';

export type CitationVariantKind = 'parenthetical' | 'intext' | 'automatic' | 'basic';

export function citationVariantKind(command: string): CitationVariantKind {
	switch (citeFormOf(command)) {
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
