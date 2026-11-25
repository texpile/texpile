// innerHTML and outerHTML of a face tree, serialized as Chromium serializes HTML
import type { FaceChild, FaceElement } from './faceElement';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

function escapeText(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/\u00a0/g, '&nbsp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/\u00a0/g, '&nbsp;')
		.replace(/"/g, '&quot;');
}

export function serializeChildren(el: FaceElement): string {
	return el.childNodes.map(serializeNode).join('');
}

function serializeNode(node: FaceChild): string {
	return node.nodeType === 3 ? escapeText(node.textContent) : serializeElement(node);
}

export function serializeElement(el: FaceElement): string {
	if (el.nodeType === 11) return serializeChildren(el);
	const tag = el.namespaceURI === null || el.namespaceURI === 'http://www.w3.org/1999/xhtml' ? el.tagName.toLowerCase() : el.tagName;
	const attrs = el.getAttributeNames().map((name) => ` ${name}="${escapeAttribute(el.getAttribute(name) ?? '')}"`);
	const open = `<${tag}${attrs.join('')}>`;
	return VOID.has(tag) ? open : `${open}${serializeChildren(el)}</${tag}>`;
}
