// A raw block or inline chip is source passed through unchanged, in the language of the file it came
// from. Pasted into a file of another language it goes in as code, never as that file's own source.
import type { Fragment } from 'prosemirror-model';

const RAW_DOM = { raw_latex: 'div.raw-latex-block', inline_latex: 'code.inline-latex' };
const RAW_LANGUAGE = 'data-raw-language';

/** each raw block and inline chip under `dom` marked with the language its node holds; both list them in the same order */
export function markCopiedRawLanguages(fragment: Fragment, dom: ParentNode): void {
	for (const [type, selector] of Object.entries(RAW_DOM)) {
		const languages: string[] = [];
		fragment.descendants((node) => void (node.type.name === type && languages.push(String(node.attrs.lang ?? 'latex'))));
		dom.querySelectorAll(selector).forEach((el, i) => el.setAttribute(RAW_LANGUAGE, languages[i] ?? 'latex'));
	}
}

/** the marked raw blocks and inline chips under `root` that are not in `target` as code */
export function convertPastedRawBlocks(root: ParentNode, target: 'latex' | 'typst'): void {
	for (const el of root.querySelectorAll(`[${RAW_LANGUAGE}]`)) {
		if (el.getAttribute(RAW_LANGUAGE) === target) continue;
		const code = el.ownerDocument.createElement(el.matches(RAW_DOM.raw_latex) ? 'pre' : 'code');
		code.textContent = el.textContent;
		el.replaceWith(code);
	}
}

export function convertPastedRawBlocksHtml(html: string, target: 'latex' | 'typst'): string {
	if (!html.includes(RAW_LANGUAGE)) return html;
	const doc = new DOMParser().parseFromString(html, 'text/html');
	convertPastedRawBlocks(doc.body, target);
	return doc.body.innerHTML;
}
