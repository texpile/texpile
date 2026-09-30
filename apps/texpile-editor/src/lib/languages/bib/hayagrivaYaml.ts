// The subset of YAML Hayagriva files are written in - block and flow mappings and lists, quoted and
// plain scalars, folded text - not YAML at large.

export type YamlNode = string | YamlNode[] | { [key: string]: YamlNode };
type Line = { indent: number; text: string };

/** throws on anything outside the subset; the caller reads a throw as "not Hayagriva" */
export function parseYamlSubset(text: string): YamlNode | null {
	const lines: Line[] = [];
	for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
		const body = stripComment(raw);
		if (!body.trim()) continue;
		if (/^(---|\.\.\.)\s*$/.test(body) || body.startsWith('%')) {
			// one document per file: a second one is not a bibliography
			if (body.startsWith('---') && lines.length) throw new Error('multi-document');
			continue;
		}
		const indent = body.length - body.trimStart().length;
		if (body.slice(0, indent).includes('\t')) throw new Error('tab indent');
		lines.push({ indent, text: body.trim() });
	}
	if (!lines.length) return null;
	const reader = new BlockReader(lines);
	const node = reader.node(0);
	if (!reader.done) throw new Error('trailing content');
	return node;
}

function isItem(text: string): boolean {
	return text === '-' || text.startsWith('- ');
}

/** the block structure, line by line; `at` is the next line to read */
class BlockReader {
	private at = 0;

	constructor(private readonly lines: Line[]) {}

	get done(): boolean {
		return this.at === this.lines.length;
	}

	/** the line about to be read, when it is indented deeper than `indent` */
	private deeper(indent: number): Line | null {
		const line = this.lines[this.at];
		return line && line.indent > indent ? line : null;
	}

	/** the node starting at the current line, which must be indented at least `min` */
	node(min: number): YamlNode {
		const line = this.lines[this.at];
		if (!line || line.indent < min) return '';
		if (isItem(line.text)) return this.list(line.indent);
		if (findKeyColon(line.text) >= 0) return this.map(line.indent);
		// a lone scalar, maybe running on over deeper lines
		this.at++;
		return this.scalar(line.text, line.indent - 1);
	}

	private list(indent: number): YamlNode {
		const out: YamlNode[] = [];
		for (let line = this.lines[this.at]; line && line.indent === indent && isItem(line.text); line = this.lines[this.at]) {
			const rest = line.text.slice(1).trimStart();
			if (!rest) {
				this.at++;
				out.push(this.node(indent + 1));
				continue;
			}
			// `- name: X` opens a mapping whose further keys line up under `name`: read the item as if
			// the dash were indentation
			const shift = line.text.length - rest.length;
			this.lines[this.at] = { indent: indent + shift, text: rest };
			out.push(this.node(indent + shift));
		}
		return out;
	}

	private map(indent: number): YamlNode {
		const out: { [key: string]: YamlNode } = {};
		for (let line = this.lines[this.at]; line && line.indent === indent && !isItem(line.text); line = this.lines[this.at]) {
			const colon = findKeyColon(line.text);
			if (colon < 0) throw new Error('expected key');
			const key = unquote(line.text.slice(0, colon).trim());
			const rest = stripProperties(line.text.slice(colon + 1).trim());
			this.at++;
			out[key] = this.value(rest, indent);
		}
		return out;
	}

	/** a key's value: `rest`, the text after its colon, and whatever belongs to it below */
	private value(rest: string, indent: number): YamlNode {
		if (!rest) {
			// the block below: deeper lines, or a list at the key's own indent
			const next = this.lines[this.at];
			return next && next.indent === indent && isItem(next.text) ? this.list(indent) : this.node(indent + 1);
		}
		if (/^[|>][-+0-9]*$/.test(rest)) {
			const parts: string[] = [];
			for (let line = this.deeper(indent); line; line = this.deeper(indent)) {
				parts.push(line.text);
				this.at++;
			}
			return parts.join(' ');
		}
		if (rest.startsWith('[') || rest.startsWith('{')) {
			// a flow collection may wrap onto deeper lines
			let src = rest;
			let node = parseFlow(src);
			for (let line = this.deeper(indent); node === null && line; line = this.deeper(indent)) {
				src += ' ' + line.text;
				this.at++;
				node = parseFlow(src);
			}
			if (node === null) throw new Error('bad flow collection');
			return node;
		}
		return this.scalar(rest, indent);
	}

	/** a plain or quoted scalar; its text continues on lines deeper than `indent` */
	private scalar(first: string, indent: number): YamlNode {
		if (first.startsWith('"') || first.startsWith("'")) {
			// a quoted scalar may wrap too; its lines fold into one, as YAML folds them
			let src = first;
			for (let line = this.deeper(indent); !readQuoted(src, 0) && line; line = this.deeper(indent)) {
				src += ' ' + line.text;
				this.at++;
			}
			const q = readQuoted(src, 0);
			if (!q) throw new Error('unterminated quote');
			return q.value;
		}
		const parts = [first];
		for (let line = this.deeper(indent); line; line = this.deeper(indent)) {
			parts.push(line.text);
			this.at++;
		}
		return parts.join(' ');
	}
}

/** drop a leading anchor or tag (`&name`, `!!str`); an alias stays as its literal text */
function stripProperties(s: string): string {
	return s.replace(/^(?:[&!]\S*\s*)+/, '');
}

/** the colon that ends a mapping key, or -1: outside quotes, followed by a space or the end */
function findKeyColon(text: string): number {
	if (text.startsWith('"') || text.startsWith("'")) {
		const q = readQuoted(text, 0);
		if (!q) return -1;
		let j = q.end;
		while (text[j] === ' ') j++;
		return text[j] === ':' && (j + 1 === text.length || /\s/.test(text[j + 1])) ? j : -1;
	}
	if (text.startsWith('[') || text.startsWith('{')) return -1;
	const m = /:(?=\s|$)/.exec(text);
	return m ? m.index : -1;
}

/** a quoted scalar starting at `start`: its value and the index past the closing quote */
function readQuoted(s: string, start: number): { value: string; end: number } | null {
	const q = s[start];
	let value = '';
	for (let j = start + 1; j < s.length; j++) {
		const c = s[j];
		if (q === "'" && c === "'") {
			if (s[j + 1] === "'") {
				value += "'";
				j++;
				continue;
			}
			return { value, end: j + 1 };
		}
		if (q === '"' && c === '\\' && j + 1 < s.length) {
			const e = s[++j];
			value += e === 'n' ? '\n' : e === 't' ? '\t' : e;
			continue;
		}
		if (q === '"' && c === '"') return { value, end: j + 1 };
		value += c;
	}
	return null;
}

function unquote(s: string): string {
	if (s.startsWith('"') || s.startsWith("'")) return readQuoted(s, 0)?.value ?? s;
	return s;
}

/** the line without its trailing `# comment`; a # inside quotes or glued to a word is text */
function stripComment(line: string): string {
	let quote: string | null = null;
	for (let j = 0; j < line.length; j++) {
		const c = line[j];
		if (quote) {
			if (c === '\\' && quote === '"') j++;
			else if (c === "'" && quote === "'" && line[j + 1] === "'") j++;
			else if (c === quote) quote = null;
		} else if ((c === '"' || c === "'") && (j === 0 || /[\s[{,:]/.test(line[j - 1]))) {
			quote = c;
		} else if (c === '#' && (j === 0 || /\s/.test(line[j - 1]))) {
			return line.slice(0, j).trimEnd();
		}
	}
	return line.trimEnd();
}

/** a whole flow collection (`[a, "b, c"]`, `{ value: x, short: y }`), or null if incomplete */
function parseFlow(src: string): YamlNode | null {
	const reader = new FlowReader(src);
	const node = reader.value('');
	return node !== null && reader.finished() ? node : null;
}

/** one line of flow syntax, character by character; `at` is the next one to read */
class FlowReader {
	private at = 0;

	constructor(private readonly src: string) {}

	finished(): boolean {
		this.skipSpace();
		return this.at === this.src.length;
	}

	private skipSpace(): void {
		while (this.at < this.src.length && /\s/.test(this.src[this.at])) this.at++;
	}

	/** the value here, a plain scalar ending at any of `stops`; null when the text is incomplete */
	value(stops: string): YamlNode | null {
		this.skipSpace();
		const c = this.src[this.at];
		if (c === '[') return this.list();
		if (c === '{') return this.map();
		if (c === '"' || c === "'") {
			const q = readQuoted(this.src, this.at);
			if (!q) return null;
			this.at = q.end;
			return q.value;
		}
		if (this.at >= this.src.length) return null;
		const start = this.at;
		while (this.at < this.src.length && !this.stopsAt(stops)) this.at++;
		return this.src.slice(start, this.at).trim();
	}

	/** a colon stops a plain scalar only as a key's colon, so `http://` stays whole */
	private stopsAt(stops: string): boolean {
		const c = this.src[this.at];
		if (!stops.includes(c)) return false;
		return c !== ':' || this.at + 1 === this.src.length || /\s/.test(this.src[this.at + 1]);
	}

	/** past what follows an item: true for a comma, false for the closing bracket, null for anything else */
	private separator(close: string): boolean | null {
		this.skipSpace();
		const c = this.src[this.at++];
		return c === ',' ? true : c === close ? false : null;
	}

	private list(): YamlNode | null {
		this.at++;
		const items: YamlNode[] = [];
		this.skipSpace();
		if (this.src[this.at] === ']') {
			this.at++;
			return items;
		}
		for (;;) {
			const item = this.value(',]');
			if (item === null) return null;
			items.push(item);
			const more = this.separator(']');
			if (more === null) return null;
			if (!more) return items;
		}
	}

	private map(): YamlNode | null {
		this.at++;
		const fields: { [key: string]: YamlNode } = {};
		this.skipSpace();
		if (this.src[this.at] === '}') {
			this.at++;
			return fields;
		}
		for (;;) {
			const key = this.value(':,}');
			if (typeof key !== 'string') return null;
			this.skipSpace();
			if (this.src[this.at++] !== ':') return null;
			const item = this.value(',}');
			if (item === null) return null;
			fields[key] = item;
			const more = this.separator('}');
			if (more === null) return null;
			if (!more) return fields;
		}
	}
}
