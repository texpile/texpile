// a vs code snippet body read into places, choices, variables and text
import { applyTransform, readTransform, type SnippetTransform } from './bodyTransform';
import { isKnownVariable, variableValue, type CursorValues } from './bodyVariables';

export type BodyInputs = {
	selection: string;
	/** a regex trigger's groups, for [[0]], [[1]], ... */
	captures: readonly string[];
	cursor?: CursorValues;
};

export type BodyNode =
	| { kind: 'text'; value: string }
	| { kind: 'field'; n: number; children: BodyNode[]; transform?: SnippetTransform }
	| { kind: 'choice'; n: number; options: string[] }
	| { kind: 'variable'; name: string; children: BodyNode[] | null; source: string; transform?: SnippetTransform };

type VariableNode = Extract<BodyNode, { kind: 'variable' }>;
export type PlaceNode = Extract<BodyNode, { kind: 'field' | 'choice' }>;

export const SELECTION_VARIABLES = new Set(['TM_SELECTED_TEXT', 'SELECTION']);

export class BodyReader {
	pos = 0;
	constructor(
		readonly src: string,
		readonly inputs: BodyInputs
	) {}

	readNodes(nested: boolean): BodyNode[] {
		const nodes: BodyNode[] = [];
		let text = '';
		function flush() {
			if (text) nodes.push({ kind: 'text', value: text });
			text = '';
		}
		while (this.pos < this.src.length) {
			const c = this.src[this.pos];
			if (c === '\\' && '$}\\'.includes(this.src[this.pos + 1] ?? '')) {
				text += this.src[this.pos + 1];
				this.pos += 2;
			} else if (nested && c === '}') break;
			else if (c === '[' && this.src[this.pos + 1] === '[') {
				const m = /^\[\[(\d+)\]\]/.exec(this.src.slice(this.pos));
				if (m && Number(m[1]) < this.inputs.captures.length) {
					text += this.inputs.captures[Number(m[1])];
					this.pos += m[0].length;
				} else {
					text += c;
					this.pos++;
				}
			} else if (c === '$') {
				const node = this.readDollar();
				if (node) {
					flush();
					nodes.push(node);
				} else {
					text += c;
					this.pos++;
				}
			} else {
				text += c;
				this.pos++;
			}
		}
		flush();
		return nodes;
	}

	readDollar(): BodyNode | null {
		const start = this.pos;
		const rest = this.src.slice(this.pos);
		let m = /^\$(\d+)/.exec(rest);
		if (m) {
			this.pos += m[0].length;
			return { kind: 'field', n: Number(m[1]), children: [] };
		}
		m = /^\$([A-Za-z_][A-Za-z0-9_]*)/.exec(rest);
		if (m) {
			this.pos += m[0].length;
			return { kind: 'variable', name: m[1], children: null, source: m[0] };
		}
		m = /^\$\{(\d+)\|/.exec(rest);
		if (m) {
			const options = this.readChoice(start + m[0].length);
			if (options) return { kind: 'choice', n: Number(m[1]), options };
			this.pos = start;
			return null;
		}
		m = /^\$\{(\d+|[A-Za-z_][A-Za-z0-9_]*)(:|\}|\/)/.exec(rest);
		if (!m) return null;
		const field = /^\d/.test(m[1]);
		if (m[2] === '/') {
			const read = readTransform(this.src, start + m[0].length);
			if (!read) return null;
			this.pos = read.end;
			const transform = read.value;
			if (field) return { kind: 'field', n: Number(m[1]), children: [], transform };
			return { kind: 'variable', name: m[1], children: null, source: this.src.slice(start, this.pos), transform };
		}
		this.pos += m[0].length;
		const children = m[2] === ':' ? this.readNodes(true) : [];
		if (m[2] === ':') {
			if (this.src[this.pos] !== '}') {
				this.pos = start;
				return null;
			}
			this.pos++;
		}
		if (field) return { kind: 'field', n: Number(m[1]), children };
		return { kind: 'variable', name: m[1], children: m[2] === ':' ? children : null, source: this.src.slice(start, this.pos) };
	}

	readChoice(from: number): string[] | null {
		const options: string[] = [];
		let current = '';
		for (let i = from; i < this.src.length; i++) {
			const c = this.src[i];
			if (c === '\\' && ',|\\$}'.includes(this.src[i + 1] ?? '')) current += this.src[++i];
			else if (c === ',') {
				options.push(current);
				current = '';
			} else if (c === '|' && this.src[i + 1] === '}') {
				options.push(current);
				this.pos = i + 2;
				return options;
			} else current += c;
		}
		return null;
	}
}

export function plainText(nodes: BodyNode[], inputs: BodyInputs): string {
	return nodes
		.map((node) => {
			if (node.kind === 'text') return node.value;
			if (node.kind === 'field') return plainText(node.children, inputs);
			if (node.kind === 'choice') return node.options[0] ?? '';
			return variableText(node, inputs);
		})
		.join('');
}

/** the variable's value, transformed; undefined when it has none and its default goes in */
export function resolvedVariable(node: VariableNode, inputs: BodyInputs): string | undefined {
	const value = variableValue(node.name, inputs.selection, inputs.cursor);
	return node.transform ? applyTransform(node.transform, value ?? '') : value;
}

function becomesPlace(node: VariableNode): boolean {
	return !node.children?.length && !isKnownVariable(node.name);
}

export function variableText(node: VariableNode, inputs: BodyInputs): string {
	if (becomesPlace(node)) return node.name;
	return resolvedVariable(node, inputs) ?? (node.children ? plainText(node.children, inputs) : '');
}

export function fieldNumbers(nodes: BodyNode[], out = new Set<number>()): Set<number> {
	for (const node of nodes) {
		if (node.kind === 'field' || node.kind === 'choice') out.add(node.n);
		if (node.kind === 'field') fieldNumbers(node.children, out);
		if (node.kind === 'variable' && node.children) fieldNumbers(node.children, out);
	}
	return out;
}

/** a body that takes the selection is a "Wrap with" entry */
export function usesSelection(body: string): boolean {
	return /\$\{?(TM_SELECTED_TEXT|SELECTION)\b/.test(body);
}

/** each unknown $NAME as a place holding its name, one number per name, after the body's own */
export function placesForUnknownVariables(nodes: BodyNode[]): BodyNode[] {
	let next = Math.max(0, ...fieldNumbers(nodes)) + 1;
	const numbers = new Map<string, number>();
	function rewrite(list: BodyNode[]): BodyNode[] {
		return list.map((node) => {
			if (node.kind === 'field') return { ...node, children: rewrite(node.children) };
			if (node.kind !== 'variable') return node;
			if (!becomesPlace(node)) return node.children ? { ...node, children: rewrite(node.children) } : node;
			if (!numbers.has(node.name)) numbers.set(node.name, next++);
			return { kind: 'field', n: numbers.get(node.name)!, children: [{ kind: 'text', value: node.name }] };
		});
	}
	return rewrite(nodes);
}

/** one number is one place: the first copy with a default or a choice sets what every copy starts with */
export function placeDefiners(nodes: BodyNode[]): Map<number, PlaceNode> {
	const firsts = new Map<number, PlaceNode>();
	function collect(list: BodyNode[]): void {
		for (const node of list) {
			if (node.kind === 'text') continue;
			const own = node.kind === 'choice' || (node.kind === 'field' && node.children.length > 0);
			if (node.kind !== 'variable' && node.n !== 0 && own && !firsts.has(node.n)) firsts.set(node.n, node);
			if (node.kind !== 'choice') collect(node.children ?? []);
		}
	}
	collect(nodes);
	return firsts;
}

export function placeDefaults(nodes: BodyNode[], inputs: BodyInputs): Map<number, { text: string; options?: string[] }> {
	const out = new Map<number, { text: string; options?: string[] }>();
	for (const [n, node] of placeDefiners(nodes)) {
		out.set(
			n,
			node.kind === 'choice' ? { text: node.options[0] ?? '', options: node.options } : { text: plainText(node.children, inputs) }
		);
	}
	return out;
}
