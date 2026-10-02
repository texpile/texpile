// A raw block is source passed through unchanged, in the language of the file it came from. Pasted
// into a file of another language it goes in as a code block, never as that file's own source.
import type { Fragment } from 'prosemirror-model';

const RAW_BLOCK = 'div.raw-latex-block';
const RAW_LANGUAGE = 'data-raw-language';

/** each raw block under `dom` marked with the language its node holds; both list them in the same order */
export function markCopiedRawLanguages(fragment: Fragment, dom: ParentNode): void {
	const languages: string[] = [];
	fragment.descendants((node) => void (node.type.name === 'raw_latex' && languages.push(String(node.attrs.lang ?? 'latex'))));
	dom.querySelectorAll(RAW_BLOCK).forEach((el, i) => el.setAttribute(RAW_LANGUAGE, languages[i] ?? 'latex'));
}

/** the marked raw blocks under `root` that are not in `target` as code blocks */
export function convertPastedRawBlocks(root: ParentNode, target: 'latex' | 'typst'): void {
	for (const el of root.querySelectorAll(`${RAW_BLOCK}[${RAW_LANGUAGE}]`)) {
		if (el.getAttribute(RAW_LANGUAGE) === target) continue;
		const pre = el.ownerDocument.createElement('pre');
		pre.textContent = el.textContent;
		el.replaceWith(pre);
	}
}

export function convertPastedRawBlocksHtml(html: string, target: 'latex' | 'typst'): string {
	if (!html.includes(RAW_LANGUAGE)) return html;
	const doc = new DOMParser().parseFromString(html, 'text/html');
	convertPastedRawBlocks(doc.body, target);
	return doc.body.innerHTML;
}
