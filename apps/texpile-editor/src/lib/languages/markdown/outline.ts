// The source-mode outline of a .md: its headings, read off the Lezer tree the source editor
// highlights with, so a # inside a fenced block or an HTML comment never becomes one. Visual
// mode's outline comes from the ProseMirror headings instead; this is its source twin, as
// languages/typst/outline is for .typ.
import { markdownLanguage } from '@codemirror/lang-markdown';
import type { SyntaxNode } from '@lezer/common';
import type { TocItem } from '$lib/editor/visual/extensions/tableofcontents/tocStore';
import { frontmatterLength } from './frontmatter';

const HEADING = /^(?:ATXHeading(\d)|SetextHeading(\d))$/;
/** syntax around the words, and the parts of a link a reader never sees */
const HIDDEN = /Mark$|^(?:URL|LinkTitle|LinkLabel|HTMLTag|Comment)$/;
const BOM = String.fromCharCode(0xfeff);

/** the headings of `src`, in document order; `pos` is a char offset */
export function markdownOutline(src: string): TocItem[] {
	// a metadata block's closing --- would read as a setext underline under its last line
	const bom = src.startsWith(BOM) ? BOM.length : 0;
	const start = bom + frontmatterLength(src.slice(bom));
	const body = src.slice(start);
	const items: TocItem[] = [];
	markdownLanguage.parser.parse(body).iterate({
		enter(n) {
			const heading = HEADING.exec(n.name);
			if (!heading) return;
			items.push({ level: Number(heading[1] ?? heading[2]), text: words(n.node, body).replace(/\s+/g, ' ').trim(), pos: start + n.from });
			return false;
		}
	});
	return items;
}

/** what a reader sees of `node`: its text without the markup around it */
function words(node: SyntaxNode, src: string): string {
	let out = '';
	let at = node.from;
	for (let c = node.firstChild; c; c = c.nextSibling) {
		out += src.slice(at, c.from);
		if (c.name === 'Escape') out += src.slice(c.from + 1, c.to);
		else if (!HIDDEN.test(c.name)) out += words(c, src);
		at = c.to;
	}
	return out + src.slice(at, node.to);
}
