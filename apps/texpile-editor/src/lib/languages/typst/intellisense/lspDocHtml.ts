// what a hover or completion doc keeps of the HTML its Markdown renders to; a guest's server is the host's
const KEPT = new Set(
	'P BR HR PRE CODE SPAN EM STRONG B I DEL S A UL OL LI H1 H2 H3 H4 H5 H6 BLOCKQUOTE TABLE THEAD TBODY TR TH TD'.split(' ')
);
// the classes the editor's highlighter gives code (style-mod names), not the app's own utilities
const HIGHLIGHT_CLASS = /^(ͼ[0-9a-z]+\s*)+$/;

export function sanitizeDocHtml(html: string): string {
	const body = new DOMParser().parseFromString(html, 'text/html').body;
	for (const el of [...body.querySelectorAll('*')]) {
		if (!KEPT.has(el.tagName)) {
			el.replaceWith(...el.childNodes);
			continue;
		}
		for (const { name, value } of [...el.attributes]) {
			const kept = name === 'class' ? HIGHLIGHT_CLASS.test(value) : name === 'href' && el.tagName === 'A' && /^https?:/i.test(value);
			if (!kept) el.removeAttribute(name);
		}
	}
	return body.innerHTML;
}
