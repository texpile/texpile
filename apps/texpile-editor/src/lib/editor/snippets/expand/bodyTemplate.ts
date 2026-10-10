// VS Code snippet syntax -> CodeMirror's snippet() template. CodeMirror reads only ${n} and
// ${n:text} and cannot hold a brace or a line break in a default, so a default it cannot hold, and a
// choice, goes in as a marker the expansion swaps for the text. Literal braces go in as markers
// too: CodeMirror 6.20 misplaces a stop that follows several escaped ones (\{\}\{${1}\})

export type BodyInputs = {
	/** the selection, for ${TM_SELECTED_TEXT} */
	selection: string;
	/** a regex trigger's groups, for [[0]], [[1]], ... */
	captures: readonly string[];
};

export type CmTemplate = {
	template: string;
	/** marker -> the text it stands for */
	fills: Map<string, string>;
	/** marker -> the options of a ${n|a,b|} choice; the first is filled in */
	choices: Map<string, string[]>;
};

type BodyNode =
	| { kind: 'text'; value: string }
	| { kind: 'field'; n: number; children: BodyNode[] }
	| { kind: 'choice'; n: number; options: string[] }
	| { kind: 'variable'; name: string; children: BodyNode[] | null; source: string };

const SELECTION_VARIABLES = new Set(['TM_SELECTED_TEXT', 'SELECTION']);
const MARKER_BASE = 0xe000;

class BodyReader {
	pos = 0;
	constructor(
		readonly src: string,
		readonly inputs: BodyInputs
	) {}

	/** nodes up to an unescaped `}` when nested, or the end */
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

	/** a tab stop, placeholder, choice or variable at `$`; null leaves the `$` as text */
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
		m = /^\$\{(\d+|[A-Za-z_][A-Za-z0-9_]*)(:|\})/.exec(rest);
		if (!m) return null;
		this.pos += m[0].length;
		const children = m[2] === ':' ? this.readNodes(true) : [];
		if (m[2] === ':') {
			if (this.src[this.pos] !== '}') {
				this.pos = start;
				return null;
			}
			this.pos++;
		}
		if (/^\d/.test(m[1])) return { kind: 'field', n: Number(m[1]), children };
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

function plainText(nodes: BodyNode[], inputs: BodyInputs): string {
	return nodes
		.map((node) => {
			if (node.kind === 'text') return node.value;
			if (node.kind === 'field') return plainText(node.children, inputs);
			if (node.kind === 'choice') return node.options[0] ?? '';
			return variableText(node, inputs);
		})
		.join('');
}

function variableText(node: Extract<BodyNode, { kind: 'variable' }>, inputs: BodyInputs): string {
	if (!SELECTION_VARIABLES.has(node.name)) return node.source;
	return inputs.selection || (node.children ? plainText(node.children, inputs) : '');
}

function fieldNumbers(nodes: BodyNode[], out = new Set<number>()): Set<number> {
	for (const node of nodes) {
		if (node.kind === 'field' || node.kind === 'choice') out.add(node.n);
		if (node.kind === 'field') fieldNumbers(node.children, out);
		if (node.kind === 'variable' && node.children) fieldNumbers(node.children, out);
	}
	return out;
}

const BRACE_MARKERS: Record<string, string> = { '{': '\ue0fe', '}': '\ue0ff' };

export function toCmTemplate(body: string, inputs: BodyInputs): CmTemplate {
	const nodes = new BodyReader(body, inputs).readNodes(false);
	const numbers = fieldNumbers(nodes);
	const last = Math.max(0, ...numbers) + 1;
	const fills = new Map<string, string>(Object.entries(BRACE_MARKERS).map(([brace, marker]) => [marker, brace]));
	const choices = new Map<string, string[]>();
	const markers = new Map<number, string>();

	function literal(text: string): string {
		return text.replace(/[{}]/g, (b) => BRACE_MARKERS[b]);
	}

	function markerFor(n: number): string {
		let marker = markers.get(n);
		if (!marker) {
			marker = String.fromCharCode(MARKER_BASE + markers.size);
			markers.set(n, marker);
		}
		return marker;
	}

	function field(n: number, text: string, options?: string[]): string {
		const seq = n === 0 ? last : n;
		if (!options && !/[{}\n]/.test(text)) return text ? `\${${seq}:${text}}` : `\${${seq}}`;
		const marker = markerFor(seq);
		fills.set(marker, text);
		if (options) choices.set(marker, options);
		return `\${${seq}:${marker}}`;
	}

	function render(list: BodyNode[]): string {
		return list
			.map((node) => {
				if (node.kind === 'text') return literal(node.value);
				if (node.kind === 'field') return field(node.n, plainText(node.children, inputs));
				if (node.kind === 'choice') return field(node.n, node.options[0] ?? '', node.options);
				return literal(variableText(node, inputs));
			})
			.join('');
	}

	let template = render(nodes);
	// without a $0 the cursor ends after the body, as in VS Code
	if (!numbers.has(0)) template += `\${${last}}`;
	return { template, fills, choices };
}

/** whether the body takes the selection, which makes it a "Wrap with" entry */
export function usesSelection(body: string): boolean {
	return /\$\{?(TM_SELECTED_TEXT|SELECTION)\b/.test(body);
}

/** the body as MathLive inserts it: each stop an empty #? slot, a choice its first option */
export function toMathLiveLatex(body: string): string {
	const inputs: BodyInputs = { selection: '', captures: [] };
	function render(list: BodyNode[]): string {
		return list
			.map((node) => {
				if (node.kind === 'text') return node.value;
				if (node.kind === 'field') return node.n === 0 ? '' : '#?';
				if (node.kind === 'choice') return node.options[0] ?? '';
				return variableText(node, inputs);
			})
			.join('');
	}
	return render(new BodyReader(body, inputs).readNodes(false));
}
