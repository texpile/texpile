// Markdown to page blocks. Prose renders to HTML through markdown-it. The shapes the docs draw
// with their own components come out as data blocks instead, and each one is ordinary markdown,
// so the same file reads on GitHub:
//
//   > [!NOTE] text                       a callout
//   ![alt](../path.png "caption")        a figure; several images in one paragraph make a row;
//                                        #narrow on the path keeps a small screenshot small
//   | Where to find it | Path | Note |   the "where to find it" block
//   | Shortcut | Action |                the shortcut table (keys separated by spaces)
//   - [Title](page.md): blurb            a list of page links becomes a card grid
//   [Label](page.md) on lines of its own  a paragraph of only links becomes a link row
//
// Links to other pages are written as paths to the .md file, relative to the current one.
import MarkdownIt, { type Env as MdEnv, type Token } from 'markdown-it';
import { posix } from 'node:path';
import type { Block, CardItem, FigureItem, LinkItem } from './blocks';
import { DOCS, type Doc } from './content.server';
import { highlightCode } from './highlight.server';
import { hrefFor } from './nav';
import { tokenize } from './prose';

interface Env extends MdEnv {
	doc: Doc;
}

const md = new MarkdownIt({ html: false, highlight: (code, lang) => highlightCode(code, lang || 'text') });

// anchor targets for deep links; the sticky navbar is 4rem, hence scroll-mt
const slugify = (text: string) =>
	text
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-|-$/g, '');

md.core.ruler.push('heading_ids', (state) => {
	const t = state.tokens;
	for (let i = 0; i < t.length; i++) {
		if (t[i].type === 'heading_open' && t[i].tag !== 'h1' && t[i + 1]?.type === 'inline') {
			t[i].attrSet('id', slugify(t[i + 1].content));
			t[i].attrJoin('class', 'scroll-mt-20');
		}
	}
});

// inline code is mostly LaTeX; colour the command and its argument the way Shiki would
md.renderer.rules.code_inline = (tokens, idx) =>
	'<code>' +
	tokenize(tokens[idx].content)
		.map((tok) => {
			const attrs = (tok.class ? ` class="${tok.class}"` : '') + (tok.color ? ` style="color:${tok.color}"` : '');
			return `<span${attrs}>${md.utils.escapeHtml(tok.text)}</span>`;
		})
		.join('') +
	'</code>';

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
	const tok = tokens[idx];
	const href = attr(tok, 'href');
	if (isExternal(href)) {
		tok.attrSet('target', '_blank');
		tok.attrSet('rel', 'noopener noreferrer');
	} else {
		tok.attrSet('href', resolveHref((env as Env).doc, href));
	}
	return self.renderToken(tokens, idx, options);
};

md.renderer.rules.image = (tokens, idx, options, env) => {
	throw new Error(`docs/${(env as Env).doc.file}: an image must be a paragraph of its own (${attr(tokens[idx], 'src')})`);
};

const attr = (tok: Token, name: string) => String(tok.attrGet(name) ?? '');

const isExternal = (href: string) => /^https?:\/\//.test(href);

/** a link as written in the file (a relative .md path, a site path, or an anchor) to a site href */
function resolveHref(doc: Doc, href: string): string {
	if (href.startsWith('#') || href.startsWith('/')) return href;
	const [file, hash] = href.split('#');
	if (!file.endsWith('.md')) throw new Error(`docs/${doc.file}: link "${href}" is not a page, a site path or an anchor`);
	const slug = posix
		.normalize(posix.join(posix.dirname(doc.file), file))
		.replace(/\.md$/, '')
		.replace(/(^|\/)README$/, '');
	if (!DOCS[slug]) throw new Error(`docs/${doc.file}: link "${href}" points at no page`);
	return hrefFor(slug) + (hash ? `#${hash}` : '');
}

/** an image path relative to the file to the asset's path from the landing root */
function resolveAsset(doc: Doc, src: string): string {
	const path = posix.normalize(posix.join('docs', posix.dirname(doc.file), src));
	if (!path.startsWith('landing/')) throw new Error(`docs/${doc.file}: image "${src}" is outside landing/`);
	return path.slice('landing'.length);
}

const text = (children: Token[]) => children.map((c) => c.content).join('');

/** index just past the block that opens at i */
function closeOf(tokens: Token[], i: number): number {
	if (tokens[i].nesting !== 1) return i + 1;
	let j = i + 1;
	while (!(tokens[j].nesting === -1 && tokens[j].level === tokens[i].level)) j++;
	return j + 1;
}

function figure(doc: Doc, children: Token[]): Block | null {
	const images = children.filter((c) => c.type === 'image');
	if (images.length === 0 || children.some((c) => c.type !== 'image' && c.type !== 'softbreak' && c.content.trim())) return null;
	let narrow = false;
	const items: FigureItem[] = images.map((img) => {
		const [file, hash] = attr(img, 'src').split('#');
		if (hash === 'narrow') narrow = true;
		else if (hash) throw new Error(`docs/${doc.file}: unknown image option #${hash}`);
		return {
			src: resolveAsset(doc, file),
			alt: text(img.children ?? []),
			caption: attr(img, 'title') || undefined,
			video: /\.(mp4|webm)$/.test(file)
		};
	});
	return { kind: 'figure', items, narrow };
}

function links(doc: Doc, children: Token[]): Block | null {
	const items: LinkItem[] = [];
	let depth = 0;
	for (const c of children) {
		if (c.type === 'link_open') {
			depth++;
			const href = attr(c, 'href');
			items.push({ href: isExternal(href) ? href : resolveHref(doc, href), label: '', external: isExternal(href) });
		} else if (c.type === 'link_close') depth--;
		else if (c.type === 'text' && depth) items[items.length - 1].label += c.content;
		else if (c.type === 'softbreak' || (c.type === 'text' && !c.content.trim())) continue;
		else return null;
	}
	return items.length ? { kind: 'links', items } : null;
}

function note(tokens: Token[], env: Env): Block | null {
	const inline = tokens[2];
	const first = inline?.children?.[0];
	const m = first && /^\[!\w+\]\s*/.exec(first.content);
	if (!m) return null;
	first.content = first.content.slice(m[0].length);
	if (!first.content && inline.children?.[1]?.type === 'softbreak') inline.children.splice(0, 2);
	return { kind: 'note', html: md.renderer.render(tokens.slice(1, -1), md.options, env) };
}

function table(tokens: Token[]): Block | null {
	const cells = (from: number, to: number) => {
		const out: string[] = [];
		for (let i = from; i < to; i++) if (tokens[i].type === 'inline') out.push(text(tokens[i].children ?? []).trim());
		return out;
	};
	const bodyAt = tokens.findIndex((t) => t.type === 'tbody_open');
	const head = cells(0, bodyAt);
	const rows: string[][] = [];
	for (let i = bodyAt; i < tokens.length; i++) {
		if (tokens[i].type !== 'tr_open') continue;
		const end = closeOf(tokens, i);
		rows.push(cells(i, end));
		i = end - 1;
	}
	if (head[0] === 'Where to find it')
		return { kind: 'where', rows: rows.map(([label, value, note]) => ({ label, value, note: note || undefined })) };
	if (head[0] === 'Shortcut') return { kind: 'keys', rows: rows.map(([keys, label]) => ({ keys, label })) };
	return null;
}

function cards(doc: Doc, tokens: Token[]): Block | null {
	const items: CardItem[] = [];
	for (let i = 1; i < tokens.length - 1; i++) {
		if (tokens[i].type !== 'list_item_open') continue;
		const end = closeOf(tokens, i);
		const c = tokens[i + 2]?.children ?? [];
		const shape = tokens[i + 1]?.type === 'paragraph_open' && end === i + 5 && c[0]?.type === 'link_open' && c[2]?.type === 'link_close';
		const blurb = c
			.slice(3)
			.map((t: Token) => t.content)
			.join('')
			.replace(/^:\s*/, '');
		if (!shape || (c.length > 3 && !blurb)) return null;
		const href = attr(c[0], 'href');
		if (isExternal(href)) return null;
		const target = DOCS[resolveHref(doc, href).replace(/^\/docs\/?/, '')];
		items.push({ href: hrefFor(target.slug), title: c[1].content, blurb: blurb || target.blurb, icon: target.icon });
		i = end - 1;
	}
	return items.length ? { kind: 'cards', items } : null;
}

function special(doc: Doc, tokens: Token[], env: Env): Block | null {
	const open = tokens[0];
	if (open.type === 'paragraph_open') {
		const children = tokens[1].children ?? [];
		return figure(doc, children) ?? links(doc, children);
	}
	if (open.type === 'blockquote_open') return note(tokens, env);
	if (open.type === 'table_open') return table(tokens);
	if (open.type === 'bullet_list_open') return cards(doc, tokens);
	return null;
}

/** the page's lead (the paragraph under the heading) and everything after it */
export function renderDoc(doc: Doc): { lead: string; blocks: Block[] } {
	const env: Env = { doc };
	const tokens = md.parse(doc.body, env);
	if (tokens[0]?.type !== 'heading_open' || tokens[0].tag !== 'h1') throw new Error(`docs/${doc.file}: must start with the # heading`);
	let i = 3;
	let lead = '';
	if (tokens[i]?.type === 'paragraph_open') {
		lead = md.renderer.renderInline(tokens[i + 1].children ?? [], md.options, env);
		i += 3;
	}
	const blocks: Block[] = [];
	let html = '';
	const flush = () => {
		if (html) blocks.push({ kind: 'html', html });
		html = '';
	};
	while (i < tokens.length) {
		const end = closeOf(tokens, i);
		const slice = tokens.slice(i, end);
		const block = special(doc, slice, env);
		if (block) {
			flush();
			blocks.push(block);
		} else html += md.renderer.render(slice, md.options, env);
		i = end;
	}
	flush();
	return { lead, blocks };
}
