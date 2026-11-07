import type { Node } from 'prosemirror-model';
import { paragraphEnders } from '../visual/core/plugin/documentMap';

export function endsParagraph(next: Node | null | undefined): boolean {
	return (
		!!next &&
		(next.type.name === 'environment' ||
			paragraphEnders.has(next.type.name) ||
			(next.type.name === 'raw_latex' && /^\s*\\begin\s*\{/.test(next.textContent)))
	);
}
