// The one markdown-it instance config for the editor importer (worker-safe: no DOM at module
// load). The default preset already includes GFM tables and ~~strikethrough~~.
import markdownit from 'markdown-it';
import type { MarkdownIt } from 'markdown-it';
import { mathPlugin } from './visual/math';
import { footnotePlugin } from './visual/footnotes';
import { referenceDefinitionPlugin } from './visual/referenceDefinitions';
import { positionsPlugin } from './positions';

export function createMarkdownEngine(): MarkdownIt {
	const md = markdownit({ html: true, linkify: false, typographer: false });
	// a destination as the author wrote it, see dest()
	md.normalizeLink = (url) => url;
	md.use(mathPlugin);
	md.use(footnotePlugin);
	md.use(referenceDefinitionPlugin);
	md.use(positionsPlugin);
	return md;
}
