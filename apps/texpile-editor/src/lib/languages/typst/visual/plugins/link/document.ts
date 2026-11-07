import type { Mark, Node } from 'prosemirror-model';
import {
	bytesSpan,
	children,
	standsFor,
	typStr,
	type TypstDocumentPlugin,
	type TypstRun,
	type TypstRunCore
} from '$lib/languages/typst/visual/core/document';
import { bareLink, bareLinkHref, linkCall, linkParts } from './linkImport';

function bareLinkOf(node: Node): Mark | null {
	const link = node.marks.find((m) => m.type.name === 'link' && m.attrs.bare === true);
	return link && node.text === link.attrs.href && /^https?:\/\/\S+$/.test(node.text ?? '') ? link : null;
}

function urlRun(node: Node, run: TypstRunCore): TypstRun | null {
	const bare = bareLinkOf(node);
	if (!bare) return null;
	return { content: run.shadowed(node, node.text ?? ''), marks: run.marks(node.marks.filter((m) => m !== bare)), kind: 'other', url: true };
}

export const linkDocument: TypstDocumentPlugin = {
	import: {
		markup: {
			inline: {
				Link: (im, nodes, i, marks) => {
					const k = nodes[i];
					const slice = im.src.slice(k.from, k.to);
					return { nodes: im.core.texts(slice, [...marks, bareLink(slice)], bytesSpan(slice.length, k.from)), next: i + 1 };
				}
			}
		},
		calls: {
			inline: {
				link: (im, hash, call, marks) => {
					const link = linkParts(call, im.src);
					if (link) {
						const mark = { type: 'link', attrs: { href: link.href, title: null, bare: false } };
						return im.core.inline(children(link.markup), im.src, [...marks, mark]);
					}
					const href = bareLinkHref(call, im.src);
					return href != null ? im.core.texts(href, [...marks, bareLink(href)], standsFor(href.length, hash.from, call.to)) : null;
				}
			},
			elements: { link: linkCall }
		}
	},
	// typDest: a link's destination when it is not a url (`<label>`), as written
	schema: ({ nodes, marks }) => {
		const link = marks.get('link')!;
		return {
			nodes,
			marks: marks.update('link', { ...link, attrs: { ...link.attrs, typDest: { default: null }, typStr: { default: false } } })
		};
	},
	save: {
		marks: { link: (a) => ({ open: `#link(${typeof a.typDest === 'string' ? a.typDest : typStr(String(a.href ?? ''))})[`, close: ']' }) },
		text: urlRun,
		// a url in prose is its own bytes while it is the url still; once its text is other words it needs a #link call
		leaf: (leaf, text) =>
			leaf.marks.some((m) => m.type.name === 'link' && m.attrs.bare === true) ? (bareLinkOf(leaf) ? text : null) : undefined
	}
};
