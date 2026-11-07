// a chip that is one include
import { childrenOf, hasSyntaxError } from '../../../knowledge/scan/syntax';
import { unquote } from '../../convert/reading/syntaxUtils';
import { typstSyntax } from '../reading/typstCall';

const QUIET = new Set(['Space', 'LineComment', 'BlockComment', 'Semicolon']);

/** the file a chip that is one include brings in */
export function readInclude(written: string): string | null {
	if (!written.startsWith('#include')) return null;
	const top = typstSyntax(written);
	if (hasSyntaxError(top)) return null;
	const kids = childrenOf(top).filter((k) => !QUIET.has(k.name));
	const include = kids.length === 2 && kids[0].name === 'Hash' && kids[1].name === 'ModuleInclude' ? kids[1] : null;
	const path = include ? childrenOf(include).find((k) => k.name === 'Str') : null;
	if (!path) return null;
	return unquote(written.slice(path.from, path.to)).split('/').pop() || null;
}
