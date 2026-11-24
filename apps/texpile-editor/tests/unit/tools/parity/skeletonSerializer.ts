export type SkeletonNode = {
	tag: string;
	class?: string[];
	attrs?: Record<string, string>;
	children?: (SkeletonNode | string)[];
};

const GEOMETRY_ATTRS = new Set(['d', 'points', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height']);

function normalizeId(value: string): string {
	return value.replace(/:[a-z]{1,2}\d+:/g, ':«id»:');
}

function placeholderText(text: string, placeholders: Record<string, string>): string {
	let out = text;
	for (const [value, name] of Object.entries(placeholders).sort((a, b) => b[0].length - a[0].length)) {
		if (value) out = out.split(value).join(`{${name}}`);
	}
	return out;
}

export function serializeSkeleton(element: Element, placeholders: Record<string, string>): SkeletonNode {
	const inSvg = element.namespaceURI === 'http://www.w3.org/2000/svg';
	const node: SkeletonNode = { tag: element.localName };
	const classes = (element.getAttribute('class') ?? '').split(/\s+/).filter((c) => c && !/^svelte-[a-z0-9]+$/.test(c));
	if (classes.length) node.class = classes;
	const attrs: Record<string, string> = {};
	for (const attr of Array.from(element.attributes)) {
		if (attr.name === 'class') continue;
		if (inSvg && node.tag !== 'svg' && GEOMETRY_ATTRS.has(attr.name)) continue;
		if (attr.name === 'data-ownedby') attrs[attr.name] = '«id»';
		else if (attr.name === 'id' || attr.name === 'aria-controls' || attr.name === 'aria-labelledby' || attr.name === 'for') {
			attrs[attr.name] = normalizeId(attr.value);
		} else {
			attrs[attr.name] = placeholderText(attr.value, placeholders);
		}
	}
	if (Object.keys(attrs).length) node.attrs = attrs;
	const children: (SkeletonNode | string)[] = [];
	for (const child of Array.from(element.childNodes)) {
		if (child.nodeType === 1) children.push(serializeSkeleton(child as Element, placeholders));
		else if (child.nodeType === 3 && child.textContent) {
			const text = placeholderText(child.textContent, placeholders);
			const last = children.at(-1);
			if (typeof last === 'string') children[children.length - 1] = last + text;
			else children.push(text);
		}
	}
	if (children.length) node.children = children;
	return node;
}
