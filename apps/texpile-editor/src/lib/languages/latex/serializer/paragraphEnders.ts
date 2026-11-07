import type { Node } from 'prosemirror-model';
import { paragraphEnders } from '../visual/core/plugin/documentMap';

/** an environment, a list or a display ends the paragraph before it: no \par of its own before one, as the file had
 * none when the two stood on a single line end */
export function endsParagraph(next: Node | null | undefined): boolean {
	return (
		!!next &&
		(next.type.name === 'environment' ||
			paragraphEnders.has(next.type.name) ||
			(next.type.name === 'raw_latex' && /^\s*\\begin\s*\{/.test(next.textContent)))
	);
}
