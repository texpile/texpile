// what a suggestion took out, drawn the way the editor draws it: the schema's own forms, and for the
// nodes a view draws (a formula, a figure) the same drawing made without one
import { DOMSerializer, type DOMOutputSpec, type Node as PMNode, type Schema } from 'prosemirror-model';
import { renderStaticMath } from './mathlivebridge/mathStatic';
import { mathSyntaxOf } from './mathlivebridge/mathFieldFactory';
import { localImageUrl } from './image/localImageUrl';

const serializers = new WeakMap<Schema, DOMSerializer>();

// the view's figure, without the attributes its counter reads: the file no longer has this figure, so
// the ones after it keep the numbers they have
function figureElement(node: PMNode): DOMOutputSpec {
	const root = document.createElement('div');
	root.className = 'pm-gone-figure';
	const img = document.createElement('img');
	img.alt = node.attrs.alt ?? '';
	const { width, maxWidth } = node.attrs;
	if (width && maxWidth) img.style.width = `${Math.min(100, (100 * width) / maxWidth)}%`;
	img.addEventListener('error', () => img.remove());
	void localImageUrl(node.attrs.src).then((url) => {
		if (url) img.src = url;
		else img.remove();
	});
	const caption = document.createElement('div');
	caption.className = 'pm-gone-caption';
	if (node.attrs.showCaption === false) caption.hidden = true;
	root.append(img, caption);
	return { dom: root, contentDOM: caption };
}

export function oldContentSerializer(schema: Schema): DOMSerializer {
	let serializer = serializers.get(schema);
	if (serializer) return serializer;
	const base = DOMSerializer.fromSchema(schema);
	const nodes = { ...base.nodes };
	if (nodes.block_math) nodes.block_math = (node) => renderStaticMath(node.textContent, true, mathSyntaxOf(node));
	if (nodes.inline_math) nodes.inline_math = (node) => renderStaticMath(node.textContent, false, mathSyntaxOf(node));
	if (nodes.image) nodes.image = figureElement;
	serializer = new DOMSerializer(nodes, base.marks);
	serializers.set(schema, serializer);
	return serializer;
}
