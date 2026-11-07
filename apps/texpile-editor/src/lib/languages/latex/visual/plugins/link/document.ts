import {
	argText,
	argTextContent,
	bareUrlOf,
	mandatoryArgs,
	optionalArg,
	type LatexDocumentPlugin
} from '$lib/languages/latex/visual/core/document';

export const linkDocument: LatexDocumentPlugin = {
	import: {
		commands: {
			url: (im, call, ctx) => {
				const href = argTextContent(im, mandatoryArgs(call)[0]);
				return im.core.texts(href, [...ctx.marks, { type: 'link', attrs: { href, title: null, bare: true } }]);
			},
			href: (im, call, ctx) => {
				const braced = mandatoryArgs(call);
				const href = argTextContent(im, braced[0]).replace(/\\([%#])/g, '$1');
				const opt = optionalArg(call);
				const marks = [...ctx.marks, { type: 'link', attrs: { href, title: null, options: opt ? argText(im.src, opt) : null } }];
				return braced[1]?.body ? im.core.inline(braced[1].body, { ...ctx, marks }) : im.core.texts(href, marks);
			}
		}
	},
	save: {
		marks: {
			// href escapes only % and #, which break it inside another command's argument and which hyperref reads back as themselves
			link: (a, inner) => {
				const url = a.bare ? bareUrlOf(inner, String(a.href ?? '')) : null;
				if (url !== null) return { open: '', close: '', inner: url };
				return {
					open: `\\href${a.options != null ? `[${a.options}]` : ''}{${String(a.href ?? '').replace(/(?<!\\)[%#]/g, '\\$&')}}{`,
					close: '}'
				};
			}
		}
	}
};
