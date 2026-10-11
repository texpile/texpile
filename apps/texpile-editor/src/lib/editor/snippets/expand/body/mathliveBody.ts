// a snippet body for an equation, its places as mathlive's #? slots
import { BodyReader, placeDefaults, plainText, variableText, type BodyInputs, type BodyNode } from './bodyNodes';
import { applyTransform } from './bodyTransform';

const SLOT = '#?';

type PlaceCopy = { n: number; own: string; shared: string; first: boolean; last: boolean };

function renderPlaces(body: string, place: (copy: PlaceCopy) => string): string {
	const inputs: BodyInputs = { selection: '', captures: [] };
	const nodes = new BodyReader(body, inputs).readNodes(false);
	const defaults = placeDefaults(nodes, inputs);
	const seen = new Set<number>();
	return nodes
		.map((node: BodyNode, i) => {
			if (node.kind === 'text') return node.value;
			if (node.kind === 'variable') return variableText(node, inputs);
			if (node.kind === 'choice') return node.options[0] ?? '';
			const shared = defaults.get(node.n)?.text ?? '';
			if (node.transform) return applyTransform(node.transform, shared);
			const first = !seen.has(node.n);
			seen.add(node.n);
			return place({ n: node.n, own: plainText(node.children, inputs), shared, first, last: i === nodes.length - 1 });
		})
		.join('');
}

function bracesBalance(text: string): boolean {
	let depth = 0;
	for (const c of text.replace(/\\./g, '')) {
		if (c === '{') depth++;
		else if (c === '}' && --depth < 0) return false;
	}
	return depth === 0;
}

/** mathlive cannot link two slots, so a place's later copies start as its default */
export function toMathLiveLatex(body: string): string {
	return renderPlaces(body, ({ n, own, shared, first, last }) => {
		if (n === 0) return last ? '' : SLOT;
		// a default cut short at an inner brace, as vs code reads it, keeps the rest balanced
		if (!bracesBalance(own)) return own;
		return first ? SLOT : shared || SLOT;
	});
}

/** typst keeps the defaults, so only an empty place is a slot */
export function toTypstSlots(body: string): string {
	return renderPlaces(body, ({ n, own, shared, last }) => own || shared || (n === 0 && last ? '' : SLOT));
}

export function toPlainText(body: string): string {
	const inputs: BodyInputs = { selection: '', captures: [] };
	return plainText(new BodyReader(body, inputs).readNodes(false), inputs);
}
