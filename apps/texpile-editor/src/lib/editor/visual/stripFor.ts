import type { Dialect } from './dialect';
import { stripMarkdown } from '$lib/languages/markdown/visual/sourceMap';
import { stripTypst } from '$lib/languages/typst/visual/sourceMap';

/** The stripper sourceMap's intra-block refinement uses, or undefined to take its LaTeX default. */
export function stripFor(dialect: Dialect | string | null): ((s: string) => string) | undefined {
	if (dialect === 'markdown' || dialect === 'md') return stripMarkdown;
	if (dialect === 'typst' || dialect === 'typ') return stripTypst;
	return undefined;
}
