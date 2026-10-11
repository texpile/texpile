// the text a vs code snippet body inserts at one place in the source editor, and where its places land
import {
	BodyReader,
	placeDefiners,
	placesForUnknownVariables,
	resolvedVariable,
	SELECTION_VARIABLES,
	type BodyInputs,
	type BodyNode,
	type PlaceNode
} from './bodyNodes';
import type { SnippetTransform } from './bodyTransform';

/** from and to count from the start of the inserted text; authored: it started with text in it */
export type InsertedPlace = { n: number; from: number; to: number; authored: boolean; transform?: SnippetTransform; options?: string[] };

export type CmInsertion = { text: string; places: InsertedPlace[] };

/** base: the line's indentation before the place; unit: what a tab at a body line's start becomes */
export type InsertionIndent = { base: string; unit: string };

function commonPrefixLength(a: string, b: string): number {
	let i = 0;
	while (i < a.length && a[i] === b[i]) i++;
	return i;
}

export function toCmInsertion(body: string, inputs: BodyInputs, indent: InsertionIndent): CmInsertion {
	const nodes = placesForUnknownVariables(new BodyReader(body, inputs).readNodes(false));
	const definers = placeDefiners(nodes);
	const places: InsertedPlace[] = [];
	const filling = new Set<number>();
	let text = '';

	function indentLine(line: string): string {
		const tabs = /^\t*/.exec(line)![0].length;
		return indent.unit.repeat(tabs) + line.slice(tabs);
	}

	// as vs code: body lines take the line's indentation, values inserted from elsewhere do not
	function addBodyText(value: string): void {
		const lines = value.split('\n');
		if (!text) lines[0] = indentLine(lines[0]);
		else if (text.endsWith('\n')) lines[0] = indent.base + indentLine(lines[0]);
		for (let i = 1; i < lines.length; i++) lines[i] = indent.base + indentLine(lines[i]);
		text += lines.join('\n');
	}

	// a selection over several lines keeps its own indentation, plus what the body adds where it goes
	function addSelection(value: string): void {
		const lastLine = text.slice(text.lastIndexOf('\n') + 1);
		const own = /^[ \t]*/.exec(lastLine)![0];
		text += value.replace(/\n/g, `\n${own.slice(commonPrefixLength(own, indent.base))}`);
	}

	function addPlace(node: PlaceNode): void {
		const start = text.length;
		const definer = node.n === 0 ? node : (definers.get(node.n) ?? node);
		let options: string[] | undefined;
		if (definer.kind === 'choice') {
			options = definer.options;
			text += options[0] ?? '';
		} else if (definer === node || !filling.has(node.n)) {
			filling.add(node.n);
			render(definer.children);
			filling.delete(node.n);
		}
		const transform = node.kind === 'field' ? node.transform : undefined;
		places.push({ n: node.n, from: start, to: text.length, authored: text.length > start, transform, options });
	}

	function render(list: BodyNode[]): void {
		for (const node of list) {
			if (node.kind === 'text') addBodyText(node.value);
			else if (node.kind !== 'variable') addPlace(node);
			else {
				const value = resolvedVariable(node, inputs);
				if (value === undefined) render(node.children ?? []);
				else if (SELECTION_VARIABLES.has(node.name)) addSelection(value);
				else text += value;
			}
		}
	}

	render(nodes);
	// without a $0 the cursor ends after the body, as in VS Code
	if (places.length && !places.some((p) => p.n === 0)) places.push({ n: 0, from: text.length, to: text.length, authored: false });
	return { text, places };
}
