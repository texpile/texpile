// token attribute readers and the image-token builders
import type { Token } from 'markdown-it';
import { buildNode, textNodes, type PmNode } from './builders';
import { formatImage } from './inlineSyntax';

export function attrStr(tok: Token, name: string): string {
	const v = tok.attrGet(name);
	return v == null ? '' : String(v);
}

/**
 * A link/image destination as the AUTHOR wrote it.
 *
 * markdown-it percent-encodes every destination it parses (normalizeLink), which is right for a
 * renderer emitting `<img src>` and wrong for us: `images/图片.png` arriving as
 * `images/%E5%9B%BE%E7%89%87.png` finds no file, and editing the block around it rewrote the author's
 * filename into escapes. Decoding that afterwards read the author's own escapes too, so the engine
 * leaves destinations unencoded.
 *
 * A link is a URL and keeps its escapes: `100%25` stays `100%25`. A picture's path is looked up on disk, so its escapes are
 * read: `my%20file.png` is the file with the space. decodeURI, not decodeURIComponent: it leaves the
 * reserved set (`?#&=+`) alone, so a query string or a `#gh-dark-mode-only` fragment survives intact.
 * A path holding a literal `%` (`100%.png`) is not valid escaping and throws; the raw string is the path.
 */
export function dest(tok: Token, name: string): string {
	const raw = attrStr(tok, name);
	// only the control characters the serializer escapes (encodeControl) are read back
	if (name === 'href') return raw.replace(/%(?:[01][0-9a-f]|7f)/gi, (e) => String.fromCharCode(parseInt(e.slice(1), 16)));
	try {
		return decodeURI(raw);
	} catch {
		return raw;
	}
}

/** the alt text as the reader sees it: `content` is the raw label, escapes and all */
export function altText(tok: Token): string {
	let out = '';
	for (const c of tok.children ?? []) {
		if (c.type === 'image') out += altText(c);
		else if (c.type === 'math_inline') out += `$${c.content}$`;
		else if (c.type === 'softbreak' || c.type === 'hardbreak') out += ' ';
		else if (c.content) out += c.content;
	}
	return out;
}

/** reconstruct the literal markdown of an image token, for the mixed-content inline chip. */
export function imageMarkdown(tok: Token): string {
	return formatImage(altText(tok), dest(tok, 'src'), attrStr(tok, 'title'));
}

/** `![alt](src "title")` alone in a paragraph: a block figure. title becomes the caption. */
export function imageBlock(tok: Token): PmNode {
	const title = attrStr(tok, 'title');
	return buildNode(
		'image',
		{
			src: dest(tok, 'src'),
			alt: altText(tok) || null,
			numbered: false,
			showCaption: !!title
		},
		title ? textNodes(title) : null
	);
}
