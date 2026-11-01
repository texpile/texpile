// a drawing read from .texpile/figures goes into the page as markup, and a shared folder can hold anything there
const ELEMENTS = new Set(['svg', 'defs', 'g', 'path', 'rect', 'image', 'clipPath', 'pattern', 'linearGradient', 'radialGradient', 'stop']);
const ATTRIBUTES = new Set([
	'xmlns',
	'width',
	'height',
	'viewBox',
	'id',
	'd',
	'x1',
	'y1',
	'x2',
	'y2',
	'cx',
	'cy',
	'r',
	'fx',
	'fy',
	'offset',
	'transform',
	'patternUnits',
	'patternTransform',
	'gradientUnits',
	'gradientTransform',
	'preserveAspectRatio',
	'opacity',
	'fill',
	'fill-opacity',
	'fill-rule',
	'stroke',
	'stroke-width',
	'stroke-opacity',
	'stroke-dasharray',
	'stroke-dashoffset',
	'stroke-linecap',
	'stroke-linejoin',
	'stroke-miterlimit',
	'stop-color',
	'clip-path',
	'clip-rule'
]);
const BLEND = /^mix-blend-mode:[a-z-]+$/;

function attributeKept(el: Element, name: string, value: string): boolean {
	if (name === 'href') return el.localName === 'image' && /^data:image\/(png|jpeg|gif|webp);/.test(value);
	if (name === 'style') return value === 'isolation:isolate' || BLEND.test(value);
	return ATTRIBUTES.has(name);
}

export function safeSavedDrawing(svg: string): string | null {
	const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
	const root = parsed.documentElement;
	if (root.localName !== 'svg' || parsed.querySelector('parsererror')) return null;
	for (const el of [root, ...root.querySelectorAll('*')]) {
		if (!ELEMENTS.has(el.localName)) {
			el.remove();
			continue;
		}
		for (const { name, value } of [...el.attributes]) if (!attributeKept(el, name, value)) el.removeAttribute(name);
	}
	return new XMLSerializer().serializeToString(root);
}
