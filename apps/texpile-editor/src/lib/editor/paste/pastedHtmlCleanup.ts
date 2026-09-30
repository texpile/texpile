// What a paste from another app keeps is the writing: its structure and emphasis. The markup Word,
// Google Docs and code editors use for lists, underline and code becomes the plain HTML the
// editors read; how the other app drew the text (fonts, sizes, colors) is never read at all.
import { convertWordLists } from './wordLists';

const MONOSPACE =
	/^\s*['"]?(courier( new)?|consolas|menlo|monaco|lucida console|source code pro|roboto mono|fira (code|mono)|jetbrains mono|sf mono|ubuntu mono|dejavu sans mono|liberation mono|cascadia (code|mono)|monospace)\b/i;

function isMonospace(family: string): boolean {
	return family.split(',').some((font) => MONOSPACE.test(font));
}

function styleOf(el: Element, property: string): string {
	return (el as HTMLElement).style?.getPropertyValue(property) ?? '';
}

function wrapChildren(el: Element, tag: string): void {
	const wrapper = el.ownerDocument.createElement(tag);
	wrapper.append(...el.childNodes);
	el.append(wrapper);
}

/** the text of a code editor's block, one child block per line */
function codeText(el: Element): string {
	let out = '';
	for (const node of el.childNodes) {
		if (node.nodeType === 3) out += node.textContent!.replace(/\u00a0/g, ' ');
		else if (node.nodeName === 'BR') out += '\n';
		else if (/^(DIV|P)$/.test(node.nodeName)) out += (out && !out.endsWith('\n') ? '\n' : '') + codeText(node as Element) + '\n';
		else out += codeText(node as Element);
	}
	return out;
}

// a code editor (VS Code) copies its lines as blocks in a monospace font and pre white-space; a
// chat app's pre-wrap message in a text font stays prose
function convertCodeBlocks(root: Element): void {
	for (const el of root.querySelectorAll('div, p')) {
		if (!el.isConnected || !/^pre/.test(styleOf(el, 'white-space')) || !isMonospace(styleOf(el, 'font-family'))) continue;
		const pre = el.ownerDocument.createElement('pre');
		pre.textContent = codeText(el).replace(/\n$/, '');
		el.replaceWith(pre);
	}
}

function convertInlineStyles(root: Element): void {
	for (const el of root.querySelectorAll('span, font')) {
		const decoration = `${styleOf(el, 'text-decoration')} ${styleOf(el, 'text-decoration-line')}`;
		// a link's own underline is the link, not emphasis
		if (/underline/.test(decoration) && !el.closest('a')) wrapChildren(el, 'u');
		if (/line-through/.test(decoration)) wrapChildren(el, 's');
		const family = styleOf(el, 'font-family') || el.getAttribute('face') || '';
		if (isMonospace(family) && !el.closest('pre, code')) wrapChildren(el, 'code');
	}
}

// Google Docs writes a nested list as the outer list's own child, beside the item it belongs under
function nestStrayLists(root: Element): void {
	for (const list of root.querySelectorAll('ul > ul, ul > ol, ol > ul, ol > ol')) {
		const item = list.previousElementSibling;
		if (item?.nodeName === 'LI') item.append(list);
	}
}

const BLOCK = /^(P|H[1-6]|UL|OL|LI|TABLE|DIV|BLOCKQUOTE|PRE)$/;

function isBlockOrNothing(node: Node | null): boolean {
	return !node || (node.nodeType === 1 && BLOCK.test(node.nodeName));
}

function siblingSkippingSpace(node: Node, forward: boolean): Node | null {
	let sibling = forward ? node.nextSibling : node.previousSibling;
	while (sibling?.nodeType === 3 && !sibling.textContent!.trim()) sibling = forward ? sibling.nextSibling : sibling.previousSibling;
	return sibling;
}

// Word's spacer paragraphs hold one no-break space and Google Docs' a line break between blocks,
// which would be written out as a stray ~ or a \\ with no line to end
function dropBlankLines(root: Element): void {
	for (const p of root.querySelectorAll('p')) {
		if (!p.textContent!.replace(/\u00a0/g, '').trim() && !p.querySelector('img')) p.remove();
	}
	for (const br of root.querySelectorAll('br')) {
		if (isBlockOrNothing(siblingSkippingSpace(br, false)) && isBlockOrNothing(siblingSkippingSpace(br, true))) br.remove();
	}
}

/** the pasted HTML with other apps' markup turned into the plain HTML the editors read */
export function cleanPastedHtml(html: string): string {
	// a fragment of table rows or cells only parses inside its table, which ProseMirror supplies itself
	if (/^(\s|<meta[^>]*>)*<(tr|td|th|thead|tbody|tfoot|col|colgroup|caption)\b/i.test(html)) return html;
	const body = new DOMParser().parseFromString(html, 'text/html').body;
	convertWordLists(body);
	nestStrayLists(body);
	convertCodeBlocks(body);
	convertInlineStyles(body);
	dropBlankLines(body);
	return body.innerHTML;
}

/** a code editor's copy (VS Code's, a JetBrains IDE's): nothing but its lines, in a monospace font */
export function isCodeEditorCopy(html: string): boolean {
	const body = new DOMParser().parseFromString(html, 'text/html').body;
	convertCodeBlocks(body);
	for (const skipped of body.querySelectorAll('style, script, meta, title')) skipped.remove();
	const loose = [...body.childNodes].some((node) => node.nodeType === 3 && node.textContent!.trim());
	return body.children.length > 0 && !loose && [...body.children].every((el) => el.nodeName === 'PRE');
}
