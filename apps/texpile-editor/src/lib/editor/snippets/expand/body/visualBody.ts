// a snippet body for visual text: plain, and once per place with that place marked
import {
	BodyReader,
	fieldNumbers,
	placeDefaults,
	placeDefiners,
	resolvedVariable,
	SELECTION_VARIABLES,
	variableText,
	type BodyInputs,
	type BodyNode,
	type PlaceNode
} from './bodyNodes';
import { applyTransform } from './bodyTransform';

/** wraps the place the caret lands in */
export const VISUAL_CARET = { start: '', end: '' } as const;

/** marked holds one text per place, in the order the caret tries them */
export type VisualBody = { plain: string; marked: string[] };

/** textSource turns a variable's value, which is plain text, into the file's language */
export function toVisualText(body: string, inputs: BodyInputs, textSource: (text: string) => string): VisualBody {
	const nodes = new BodyReader(body, inputs).readNodes(false);
	const definers = placeDefiners(nodes);
	const defaults = placeDefaults(nodes, inputs);
	const numbers = [...fieldNumbers(nodes)].sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b));

	function placeText(node: PlaceNode, walk: (list: BodyNode[]) => string): string {
		const shared = defaults.get(node.n)?.text ?? '';
		if (node.kind === 'choice') return shared;
		if (node.transform) return applyTransform(node.transform, shared);
		return node.n === 0 || definers.get(node.n) === node ? walk(node.children) : shared;
	}

	function render(target: number): string {
		let placed = false;
		function walk(list: BodyNode[]): string {
			return list
				.map((node) => {
					if (node.kind === 'text') return node.value;
					if (node.kind === 'variable') {
						const value = SELECTION_VARIABLES.has(node.name) ? undefined : resolvedVariable(node, inputs);
						return value === undefined ? variableText(node, inputs) : textSource(value);
					}
					const mark = node.n === target && !placed && !(node.kind === 'field' && node.transform);
					if (mark) placed = true;
					const inner = placeText(node, walk);
					return mark ? `${VISUAL_CARET.start}${inner}${VISUAL_CARET.end}` : inner;
				})
				.join('');
		}
		return walk(nodes);
	}

	return { plain: render(-1), marked: numbers.map(render) };
}
