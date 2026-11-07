// helpers shared by the markdown regression tests
import { parseMarkdownFile, serializeMarkdownFile } from '$lib/languages/markdown/visual/roundtrip';
import { serializeToMarkdown } from '$lib/languages/markdown/visual/serialize/serializer';
import { markdownToProseMirror } from '$lib/languages/markdown/visual/converter';
import { mdSchema } from '$lib/languages/markdown/visual/schema';
import type { Node } from 'prosemirror-model';

/** the no-edit save: parse then serialize, nothing touched */
export function roundtrip(src: string): string {
	const parsed = parseMarkdownFile(src);
	return serializeMarkdownFile(parsed, parsed.doc);
}

/** the deterministic path: what every block regenerates to */
export function gen(src: string): string {
	return serializeToMarkdown(markdownToProseMirror(src).doc);
}

/** gen of gen: equal to gen once regeneration has reached a fixed point */
export function regen(src: string): string {
	return gen(gen(src));
}

/** the save after replacing top-level block `index` with a paragraph reading `text` */
export function editBlock(src: string, index: number, text: string): string {
	const parsed = parseMarkdownFile(src);
	const kids: Node[] = [];
	parsed.doc.forEach((child, _offset, i) => kids.push(i === index ? mdSchema.nodes.paragraph.create(null, mdSchema.text(text)) : child));
	return serializeMarkdownFile(parsed, parsed.doc.copy(mdSchema.nodes.doc.create(null, kids).content));
}

export function blockTypes(src: string): string[] {
	const out: string[] = [];
	markdownToProseMirror(src).doc.forEach((c) => out.push(c.type.name));
	return out;
}

/** a doc built from editor nodes, the way typing does it */
export function docOf(...blocks: Node[]): Node {
	return mdSchema.nodes.doc.create(null, blocks);
}

export function para(...content: (Node | string)[]): Node {
	return mdSchema.nodes.paragraph.create(
		null,
		content.map((c) => (typeof c === 'string' ? mdSchema.text(c) : c))
	);
}

export function marked(text: string, ...marks: string[]): Node {
	return mdSchema.text(
		text,
		marks.map((m) => mdSchema.marks[m].create())
	);
}
